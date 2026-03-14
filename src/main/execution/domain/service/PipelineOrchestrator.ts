/**
 * 流水线编排器（领域服务）
 *
 * 编排多步骤工作流的执行生命周期：
 * 步骤迭代 → 模板渲染 → 配置构建 → 执行 → 验证 → 失败策略 → 输出处理
 *
 * 所有外部依赖通过接口注入，保持领域层无基础设施耦合。
 *
 * @author zhourui
 * @since 2026/03/14
 */

import type { MergedConfig, StepMergedConfig } from '../../../configuration/domain/model';
import type { ConfigMergeService, WorkflowConfigRef, StepConfigRef } from '../../../configuration/domain/service/ConfigMergeService';
import type { ExecutionRepository } from '../repository/ExecutionRepository';
import type { StepEvent } from '../model/StepEvent';
import type { StepResult, ValidationResult, ExecutionResult, ExecutionProgressEvent } from '../model/ExecutionResult';
import type { ExecutionStatus, TriggerType } from '../model/ExecutionStatus';
import type { TemplateContext } from './TemplateEngine';
import { TemplateEngine } from './TemplateEngine';

// ========== 依赖注入接口 ==========

/**
 * 步骤执行器接口（基础设施层实现，封装 Claude Agent SDK 调用）
 */
export interface StepExecutor {
  execute(prompt: string, config: MergedConfig | StepMergedConfig, onEvent?: (e: StepEvent) => void): Promise<StepResult>;
  executeWithTimeout(prompt: string, config: MergedConfig, timeoutMs: number, onEvent?: (e: StepEvent) => void): Promise<StepResult>;
  validateOutput(outputText: string, validationPrompt: string, config: MergedConfig): Promise<ValidationResult>;
}

/**
 * 进度通知器接口（基础设施层实现，封装 IPC 广播逻辑）
 */
export interface ProgressNotifier {
  broadcastStepStart(executionId: string, stepIndex: number): void;
  broadcastStepEvent(executionId: string, stepIndex: number, event: StepEvent): void;
  broadcastStepResult(executionId: string, stepIndex: number, success: boolean, outputText?: string, tokensUsed?: number, errorMessage?: string): void;
  broadcast(event: ExecutionProgressEvent): void;
}

/**
 * 输出处理器接口（基础设施层实现，封装文件输出和 Webhook 通知）
 */
export interface OutputProcessor {
  process(output: any, result: ExecutionResult, inputs: Record<string, unknown>): Promise<void>;
}

// ========== 工作流引用接口 ==========

/**
 * 工作流步骤定义（跨上下文引用，避免直接依赖 Workflow 限界上下文）
 */
export interface WorkflowStepRef {
  name: string;
  prompt: string;
  model?: string;
  maxTurns?: number;
  onFailure?: 'stop' | 'skip' | 'retry';
  retryConfig?: {
    maxAttempts?: number;
    delayMs?: number;
  };
  validation?: {
    prompt: string;
  };
  mcpServerIds?: string[];
  skillIds?: string[];
}

/**
 * 工作流引用（跨上下文引用，仅包含流水线编排所需的字段）
 */
export interface WorkflowRef {
  id: string;
  name: string;
  steps: WorkflowStepRef[];
  onFailure: 'stop' | 'skip' | 'retry';
  limits?: {
    maxTokens?: number;
    maxTurns?: number;
    timeoutMs?: number;
  };
  output?: any;
  rules?: string;
  mcpServers?: Record<string, any>;
  skills?: Record<string, string>;
  workingDirectory?: string;
}

// ========== 常量 ==========

const DEFAULT_RETRY_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;

/**
 * 单步执行结果（内部使用）
 */
interface StepRunResult {
  success: boolean;
  tokensUsed: number;
  outputText: string;
  errorMessage?: string;
}

/**
 * 多步骤流水线编排器
 *
 * 协调执行仓储、步骤执行器、配置合并服务、进度通知器、输出处理器和模板引擎，
 * 完成工作流的端到端执行编排。
 */
export class PipelineOrchestrator {
  constructor(
    private readonly executionRepository: ExecutionRepository,
    private readonly stepExecutor: StepExecutor,
    private readonly configMergeService: ConfigMergeService,
    private readonly progressNotifier: ProgressNotifier,
    private readonly outputProcessor: OutputProcessor,
    private readonly templateEngine: TemplateEngine
  ) {}

  /**
   * 启动工作流执行
   *
   * 创建执行记录后立即返回执行 ID，流水线在后台异步执行。
   *
   * @param workflow 工作流引用
   * @param inputs 输入参数
   * @param triggerType 触发类型
   * @returns 执行 ID
   */
  async execute(
    workflow: WorkflowRef,
    inputs: Record<string, unknown>,
    triggerType: TriggerType
  ): Promise<string> {
    const execution = this.executionRepository.create(workflow.id, triggerType);

    this.runPipelineAsync(workflow, execution.id, inputs);

    return execution.id;
  }

  /**
   * 异步执行流水线（不抛出异常，错误写入执行记录）
   */
  private async runPipelineAsync(
    workflow: WorkflowRef,
    executionId: string,
    inputs: Record<string, unknown>
  ): Promise<void> {
    const context: TemplateContext = { inputs, steps: {} };
    let totalTokens = 0;

    try {
      this.executionRepository.updateStatus(executionId, 'running');

      const globalConfig = this.configMergeService.loadGlobalConfig();
      const workflowConfigRef: WorkflowConfigRef = {
        rules: workflow.rules,
        mcpServers: workflow.mcpServers,
        skills: workflow.skills,
        limits: workflow.limits,
        workingDirectory: workflow.workingDirectory
      };
      const mergedConfig = this.configMergeService.mergeWorkflowConfig(globalConfig, workflowConfigRef);

      for (let i = 0; i < workflow.steps.length; i++) {
        const step = workflow.steps[i];
        const onFailure = step.onFailure || workflow.onFailure;

        const stepResult = await this.runStep(
          step, i, executionId, workflow, mergedConfig, context
        );

        totalTokens += stepResult.tokensUsed;

        if (!stepResult.success) {
          if (onFailure === 'skip') {
            continue;
          }

          this.executionRepository.updateStatus(executionId, 'failed', stepResult.errorMessage);
          return;
        }

        if (workflow.limits?.maxTokens && totalTokens >= workflow.limits.maxTokens) {
          this.executionRepository.updateStatus(executionId, 'failed', 'Token limit exceeded');
          return;
        }
      }

      this.executionRepository.updateStatus(executionId, 'success');

      const executionResult: ExecutionResult = {
        success: true,
        totalTokens,
        outputs: this.flattenContext(context)
      };

      await this.outputProcessor.process(workflow.output, executionResult, inputs);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.executionRepository.updateStatus(executionId, 'failed', errorMessage);
    }
  }

  /**
   * 执行单个步骤的完整生命周期
   *
   * 模板渲染 → 创建记录 → 构建配置 → 执行（含重试） → 验证 → 更新记录 → 广播结果
   */
  private async runStep(
    step: WorkflowStepRef,
    stepIndex: number,
    executionId: string,
    workflow: WorkflowRef,
    mergedConfig: MergedConfig,
    context: TemplateContext
  ): Promise<StepRunResult> {
    // 1. 模板变量验证与渲染
    const unresolvedVariables = this.templateEngine.validate(step.prompt, context);
    if (unresolvedVariables.length > 0) {
      // 未解析的变量不阻断执行，仅记录
    }
    const renderedPrompt = this.templateEngine.render(step.prompt, context);

    // 2. 创建步骤执行记录
    this.executionRepository.updateCurrentStep(executionId, stepIndex);
    const stepExecution = this.executionRepository.createStepExecution(executionId, stepIndex, renderedPrompt);
    this.progressNotifier.broadcastStepStart(executionId, stepIndex);

    // 3. 构建步骤级配置
    const workflowConfigRef: WorkflowConfigRef = {
      rules: workflow.rules,
      mcpServers: workflow.mcpServers,
      skills: workflow.skills,
      limits: workflow.limits,
      workingDirectory: workflow.workingDirectory
    };
    const stepConfigRef: StepConfigRef = {
      model: step.model,
      maxTurns: step.maxTurns,
      mcpServerIds: step.mcpServerIds,
      skillIds: step.skillIds
    };
    const stepConfig = this.configMergeService.buildStepMergedConfig(
      mergedConfig, workflowConfigRef, stepConfigRef, executionId, stepIndex
    );

    // 4. 执行步骤（含事件收集）
    const collectedEvents: StepEvent[] = [];
    const onEvent = (event: StepEvent) => {
      collectedEvents.push(event);
      this.progressNotifier.broadcastStepEvent(executionId, stepIndex, event);
    };

    let result: StepResult;
    const onFailure = step.onFailure || workflow.onFailure;

    try {
      if (onFailure === 'retry') {
        const maxAttempts = step.retryConfig?.maxAttempts || DEFAULT_RETRY_MAX_ATTEMPTS;
        const delayMs = step.retryConfig?.delayMs || DEFAULT_RETRY_DELAY_MS;
        result = await this.executeWithRetry(renderedPrompt, stepConfig, maxAttempts, delayMs, onEvent);
      } else if (stepConfig.timeoutMs) {
        result = await this.stepExecutor.executeWithTimeout(renderedPrompt, stepConfig, stepConfig.timeoutMs, onEvent);
      } else {
        result = await this.stepExecutor.execute(renderedPrompt, stepConfig, onEvent);
      }
    } finally {
      if (stepConfig.skillsDir) {
        this.configMergeService.cleanupStepSkills(stepConfig.skillsDir);
      }
    }

    // 5. 输出验证（可选）
    let validationStatus: 'passed' | 'failed' | undefined;
    let validationOutput: string | undefined;
    let validationTokens = 0;

    if (result.success && step.validation?.prompt) {
      this.progressNotifier.broadcast({
        executionId, stepIndex, status: 'running', outputText: result.outputText
      });

      const validation = await this.stepExecutor.validateOutput(result.outputText, step.validation.prompt, stepConfig);
      validationStatus = validation.passed ? 'passed' : 'failed';
      validationOutput = validation.output;
      validationTokens = validation.tokensUsed;

      if (!validation.passed) {
        result = {
          ...result,
          success: false,
          errorMessage: `验证失败: ${validation.output}`
        };
      }
    }

    // 6. 更新步骤执行记录
    this.executionRepository.updateStepExecution(stepExecution.id, {
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
    this.progressNotifier.broadcastStepResult(
      executionId, stepIndex, result.success,
      result.outputText, result.tokensUsed, result.errorMessage
    );

    const totalStepTokens = result.tokensUsed + validationTokens;
    this.executionRepository.addTokens(executionId, totalStepTokens);

    return {
      success: result.success,
      tokensUsed: totalStepTokens,
      outputText: result.outputText,
      errorMessage: result.errorMessage
    };
  }

  /**
   * 带重试的步骤执行（指数退避）
   */
  private async executeWithRetry(
    prompt: string,
    config: MergedConfig | StepMergedConfig,
    maxAttempts: number,
    delayMs: number,
    onEvent?: (event: StepEvent) => void
  ): Promise<StepResult> {
    let lastResult: StepResult | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (config.timeoutMs) {
        lastResult = await this.stepExecutor.executeWithTimeout(prompt, config, config.timeoutMs, onEvent);
      } else {
        lastResult = await this.stepExecutor.execute(prompt, config, onEvent);
      }

      if (lastResult.success) {
        return lastResult;
      }

      if (attempt < maxAttempts) {
        const backoffDelay = delayMs * Math.pow(2, attempt - 1);
        await this.delay(backoffDelay);
      }
    }

    return lastResult!;
  }

  /**
   * 扁平化上下文为输出对象
   */
  private flattenContext(context: TemplateContext): Record<string, unknown> {
    const outputs: Record<string, unknown> = { inputs: context.inputs };

    if (context.steps) {
      for (const [stepName, stepData] of Object.entries(context.steps)) {
        outputs[`steps.${stepName}.output`] = stepData.output;
      }
    }

    return outputs;
  }

  /**
   * 延迟执行
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
