/**
 * 单步骤执行器
 *
 * 管理单个步骤的完整生命周期：模板渲染 → 配置构建 → 执行 → 验证 → 记录
 *
 * @author zhourui(V33215020)
 * @since 2026/03/14
 */

import log from 'electron-log';
import { executionRepository } from '../../store/repositories';
import type {
  Workflow,
  WorkflowStep,
  MergedConfig,
  StepResult,
  StepEvent
} from '../../store/models';
import type { TemplateContext } from '../template';
import { renderTemplate, validateTemplate } from '../template';
import { executeStep, executeStepWithTimeout, validateStepOutput } from '../executor';
import { buildStepMergedConfig, cleanupStepSkills, type StepMergedConfig } from '../config/configMerger';
import { ProgressBroadcaster } from './progressBroadcaster';

const DEFAULT_RETRY_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;

/**
 * 单步骤执行结果
 */
export interface StepRunResult {
  success: boolean;
  tokensUsed: number;
  outputText: string;
  errorMessage?: string;
}

/**
 * 延迟执行
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 带重试的步骤执行
 */
async function executeWithRetry(
  prompt: string,
  config: MergedConfig | StepMergedConfig,
  maxAttempts: number,
  delayMs: number,
  onEvent?: (event: StepEvent) => void
): Promise<StepResult> {
  let lastResult: StepResult | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    log.debug(`Step attempt ${attempt}/${maxAttempts}`);

    if (config.timeoutMs) {
      lastResult = await executeStepWithTimeout(prompt, config, config.timeoutMs, onEvent);
    } else {
      lastResult = await executeStep(prompt, config, onEvent);
    }

    if (lastResult.success) {
      return lastResult;
    }

    if (attempt < maxAttempts) {
      const backoffDelay = delayMs * Math.pow(2, attempt - 1);
      log.debug(`Retrying after ${backoffDelay}ms`);
      await delay(backoffDelay);
    }
  }

  return lastResult!;
}

/**
 * 执行单个步骤的完整生命周期
 *
 * @param step 步骤定义
 * @param stepIndex 步骤索引
 * @param executionId 执行 ID
 * @param workflow 工作流对象
 * @param mergedConfig 合并后的基础配置
 * @param context 模板上下文（会被修改：写入步骤输出）
 * @param broadcaster 进度广播器
 * @returns 步骤执行结果
 */
export async function runStep(
  step: WorkflowStep,
  stepIndex: number,
  executionId: string,
  workflow: Workflow,
  mergedConfig: MergedConfig,
  context: TemplateContext,
  broadcaster: ProgressBroadcaster
): Promise<StepRunResult> {
  log.info(`Executing step ${stepIndex + 1}/${workflow.steps.length}: ${step.name}`);

  // 1. 模板变量验证与渲染
  const unresolvedVariables = validateTemplate(step.prompt, context);
  if (unresolvedVariables.length > 0) {
    log.warn(`Step "${step.name}" has unresolved template variables: ${unresolvedVariables.join(', ')}`);
  }
  const renderedPrompt = renderTemplate(step.prompt, context);

  // 2. 创建步骤执行记录
  executionRepository.updateCurrentStep(executionId, stepIndex);
  const stepExecution = executionRepository.createStepExecution(executionId, stepIndex, renderedPrompt);
  broadcaster.broadcastStepStart(executionId, stepIndex);

  // 3. 构建步骤配置
  const stepConfig = buildStepMergedConfig(
    mergedConfig, workflow, step, executionId, stepIndex,
    (warning) => log.warn(warning)
  );

  // 4. 执行步骤（含事件收集）
  const collectedEvents: StepEvent[] = [];
  const onEvent = (event: StepEvent) => {
    collectedEvents.push(event);
    broadcaster.broadcastStepEvent(executionId, stepIndex, event);
  };

  let result: StepResult;
  const onFailure = step.onFailure || workflow.onFailure;

  try {
    if (onFailure === 'retry') {
      const maxAttempts = step.retryConfig?.maxAttempts || DEFAULT_RETRY_MAX_ATTEMPTS;
      const delayMs = step.retryConfig?.delayMs || DEFAULT_RETRY_DELAY_MS;
      result = await executeWithRetry(renderedPrompt, stepConfig, maxAttempts, delayMs, onEvent);
    } else {
      result = await executeStep(renderedPrompt, stepConfig, onEvent);
    }
  } finally {
    if (stepConfig.skillsDir) {
      cleanupStepSkills(stepConfig.skillsDir);
    }
  }

  // 5. 输出验证（可选）
  let validationStatus: 'passed' | 'failed' | undefined;
  let validationOutput: string | undefined;
  let validationTokens = 0;

  if (result.success && step.validation?.prompt) {
    log.info(`Validating step ${step.name} output`);
    broadcaster.broadcast({
      executionId, stepIndex, status: 'running', outputText: result.outputText
    });

    const validation = await validateStepOutput(result.outputText, step.validation.prompt, stepConfig);
    validationStatus = validation.passed ? 'passed' : 'failed';
    validationOutput = validation.output;
    validationTokens = validation.tokensUsed;

    if (!validation.passed) {
      result.success = false;
      result.errorMessage = `验证失败: ${validation.output}`;
      log.warn(`Step ${step.name} validation failed`);
    }
  }

  // 6. 更新步骤执行记录
  executionRepository.updateStepExecution(stepExecution.id, {
    status: result.success ? 'success' : 'failed',
    outputText: result.outputText,
    tokensUsed: result.tokensUsed,
    modelUsed: stepConfig.model,
    errorMessage: result.errorMessage,
    validationStatus,
    validationOutput,
    eventsJson: JSON.stringify(collectedEvents)
  });

  // 7. 更新模板上下文
  context.steps![step.name] = { output: result.outputText };

  // 8. 广播步骤结果
  broadcaster.broadcastStepResult(
    executionId, stepIndex, result.success,
    result.outputText, result.tokensUsed, result.errorMessage
  );

  const totalStepTokens = result.tokensUsed + validationTokens;
  executionRepository.addTokens(executionId, totalStepTokens);

  return {
    success: result.success,
    tokensUsed: totalStepTokens,
    outputText: result.outputText,
    errorMessage: result.errorMessage
  };
}
