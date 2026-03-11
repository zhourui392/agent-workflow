/**
 * 多步骤流水线编排器
 *
 * @author zhourui(V33215020)
 * @since 2026/03/11
 */

import { BrowserWindow } from 'electron';
import log from 'electron-log';
import { executionRepository } from '../store/repositories';
import type {
  Workflow,
  MergedConfig,
  ExecutionResult,
  StepResult,
  ExecutionProgressEvent,
  TriggerType
} from '../store/models';
import { renderTemplate, type TemplateContext } from './template';
import { executeStep, executeStepWithTimeout, validateStepOutput } from './executor';
import { loadGlobalConfig, mergeConfig, getStepConfig } from './configMerger';
import { handleOutput } from './outputHandler';

const DEFAULT_RETRY_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;

/**
 * 广播执行进度到所有窗口
 *
 * @param event 进度事件
 */
function broadcastProgress(event: ExecutionProgressEvent): void {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    win.webContents.send('execution:progress', event);
  }
}

/**
 * 延迟执行
 *
 * @param ms 毫秒数
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 带重试的步骤执行
 *
 * @param prompt 渲染后的提示词
 * @param config 合并后的配置
 * @param maxAttempts 最大重试次数
 * @param delayMs 重试延迟
 * @param onProgress 进度回调
 * @returns 步骤执行结果
 */
async function executeStepWithRetry(
  prompt: string,
  config: MergedConfig,
  maxAttempts: number,
  delayMs: number,
  onProgress?: (text: string) => void
): Promise<StepResult> {
  let lastResult: StepResult | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    log.debug(`Step attempt ${attempt}/${maxAttempts}`);

    if (config.timeoutMs) {
      lastResult = await executeStepWithTimeout(prompt, config, config.timeoutMs, onProgress);
    } else {
      lastResult = await executeStep(prompt, config, onProgress);
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
 * 执行工作流流水线
 *
 * @param workflow 工作流对象
 * @param inputs 输入参数
 * @param triggerType 触发类型
 * @returns 执行ID
 */
export async function executePipeline(
  workflow: Workflow,
  inputs: Record<string, unknown>,
  triggerType: TriggerType
): Promise<string> {
  const execution = executionRepository.create(workflow.id, triggerType);
  log.info(`Starting pipeline execution: ${execution.id} for workflow: ${workflow.name}`);

  runPipelineAsync(workflow, execution.id, inputs);

  return execution.id;
}

/**
 * 异步执行流水线
 *
 * @param workflow 工作流对象
 * @param executionId 执行ID
 * @param inputs 输入参数
 */
async function runPipelineAsync(
  workflow: Workflow,
  executionId: string,
  inputs: Record<string, unknown>
): Promise<void> {
  const context: TemplateContext = {
    inputs,
    steps: {}
  };
  let totalTokens = 0;

  try {
    executionRepository.updateStatus(executionId, 'running');

    const globalConfig = loadGlobalConfig();
    const mergedConfig = mergeConfig(globalConfig, workflow);

    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      executionRepository.updateCurrentStep(executionId, i);

      log.info(`Executing step ${i + 1}/${workflow.steps.length}: ${step.name}`);

      const renderedPrompt = renderTemplate(step.prompt, context);

      const stepExecution = executionRepository.createStepExecution(
        executionId,
        i,
        renderedPrompt
      );

      broadcastProgress({
        executionId,
        stepIndex: i,
        status: 'running'
      });

      const stepConfig = getStepConfig(mergedConfig, step.model, step.maxTurns);

      let result: StepResult;
      const onFailure = step.onFailure || workflow.onFailure;

      if (onFailure === 'retry') {
        const maxAttempts = step.retryConfig?.maxAttempts || DEFAULT_RETRY_MAX_ATTEMPTS;
        const delayMs = step.retryConfig?.delayMs || DEFAULT_RETRY_DELAY_MS;
        result = await executeStepWithRetry(
          renderedPrompt,
          stepConfig,
          maxAttempts,
          delayMs,
          text => {
            broadcastProgress({
              executionId,
              stepIndex: i,
              status: 'running',
              outputText: text
            });
          }
        );
      } else {
        result = await executeStep(renderedPrompt, stepConfig, text => {
          broadcastProgress({
            executionId,
            stepIndex: i,
            status: 'running',
            outputText: text
          });
        });
      }

      executionRepository.addTokens(executionId, result.tokensUsed);
      totalTokens += result.tokensUsed;

      // 步骤执行成功且配置了验证时，执行输出验证
      let validationStatus: 'passed' | 'failed' | undefined;
      let validationOutput: string | undefined;

      if (result.success && step.validation?.prompt) {
        log.info(`Validating step ${step.name} output`);

        broadcastProgress({
          executionId,
          stepIndex: i,
          status: 'running',
          outputText: result.outputText
        });

        const validation = await validateStepOutput(
          result.outputText,
          step.validation.prompt,
          stepConfig
        );

        validationStatus = validation.passed ? 'passed' : 'failed';
        validationOutput = validation.output;

        executionRepository.addTokens(executionId, validation.tokensUsed);
        totalTokens += validation.tokensUsed;

        if (!validation.passed) {
          result.success = false;
          result.errorMessage = `验证失败: ${validation.output}`;
          log.warn(`Step ${step.name} validation failed`);
        }
      }

      executionRepository.updateStepExecution(stepExecution.id, {
        status: result.success ? 'success' : 'failed',
        outputText: result.outputText,
        tokensUsed: result.tokensUsed,
        modelUsed: stepConfig.model,
        errorMessage: result.errorMessage,
        validationStatus,
        validationOutput
      });

      context.steps![step.name] = { output: result.outputText };

      broadcastProgress({
        executionId,
        stepIndex: i,
        status: result.success ? 'success' : 'failed',
        outputText: result.outputText,
        tokensUsed: result.tokensUsed,
        errorMessage: result.errorMessage
      });

      if (!result.success) {
        if (onFailure === 'stop') {
          log.error(`Step ${step.name} failed, stopping pipeline`);
          executionRepository.updateStatus(executionId, 'failed', result.errorMessage);
          return;
        }

        if (onFailure === 'skip') {
          log.warn(`Step ${step.name} failed, skipping to next step`);
          continue;
        }

        log.error(`Step ${step.name} failed after retries, stopping pipeline`);
        executionRepository.updateStatus(executionId, 'failed', result.errorMessage);
        return;
      }

      if (workflow.limits?.maxTokens && totalTokens >= workflow.limits.maxTokens) {
        log.warn(`Token limit reached: ${totalTokens}/${workflow.limits.maxTokens}`);
        executionRepository.updateStatus(executionId, 'failed', 'Token limit exceeded');
        return;
      }
    }

    executionRepository.updateStatus(executionId, 'success');

    const executionResult: ExecutionResult = {
      success: true,
      totalTokens,
      outputs: flattenContext(context)
    };

    await handleOutput(workflow.output, executionResult, inputs);

    log.info(`Pipeline execution completed: ${executionId}, total tokens: ${totalTokens}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Pipeline execution failed: ${executionId}`, error);
    executionRepository.updateStatus(executionId, 'failed', errorMessage);
  }
}

/**
 * 扁平化上下文为输出对象
 *
 * @param context 模板上下文
 * @returns 扁平化的输出对象
 */
function flattenContext(context: TemplateContext): Record<string, unknown> {
  const outputs: Record<string, unknown> = {
    inputs: context.inputs
  };

  if (context.steps) {
    for (const [stepName, stepData] of Object.entries(context.steps)) {
      outputs[`steps.${stepName}.output`] = stepData.output;
    }
  }

  return outputs;
}
