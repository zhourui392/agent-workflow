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
import type { CancellationRegistry } from './CancellationRegistry';
import type { RuleValidator, ValidationRule } from './RuleValidator';

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

/**
 * 工作流加载器接口（基础设施层实现，根据 ID 加载工作流定义）
 */
export interface WorkflowLoader {
  loadWorkflow(workflowId: string): WorkflowRef | null;
}

// ========== 工作流引用接口 ==========

/**
 * Agent 步骤引用（跨上下文引用，避免直接依赖 Workflow 限界上下文）
 */
export interface AgentStepRef {
  type?: 'agent';
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
    prompt?: string;
    rules?: ValidationRule[];
  };
  skillIds?: string[];
}

/**
 * 子工作流步骤引用
 */
export interface SubWorkflowStepRef {
  type: 'subWorkflow';
  name: string;
  workflowId: string;
  inputMapping?: Record<string, string>;
  forEach?: {
    iterateOver: string;
    itemVariable: string;
  };
  onFailure?: 'stop' | 'skip' | 'retry';
  retryConfig?: {
    maxAttempts?: number;
    delayMs?: number;
  };
}

/**
 * 数据拆分步骤引用
 */
export interface DataSplitStepRef {
  type: 'dataSplit';
  name: string;
  mode: 'static' | 'template' | 'ai';
  staticData?: string;
  templateExpr?: string;
  aiInput?: string;
  aiPrompt?: string;
  onFailure?: 'stop' | 'skip' | 'retry';
  retryConfig?: {
    maxAttempts?: number;
    delayMs?: number;
  };
}

/**
 * ForEach 循环步骤引用
 */
export interface ForEachStepRef {
  type: 'forEach';
  name: string;
  prompt: string;
  iterateOver: string;
  itemVariable: string;
  model?: string;
  maxTurns?: number;
  onFailure?: 'stop' | 'skip' | 'retry';
  retryConfig?: {
    maxAttempts?: number;
    delayMs?: number;
  };
  validation?: {
    prompt?: string;
    rules?: Array<{ type: 'regex' | 'contains'; pattern?: string; value?: string }>;
  };
  skillIds?: string[];
}

export type WorkflowStepRef = AgentStepRef | SubWorkflowStepRef | DataSplitStepRef | ForEachStepRef;

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
  skills?: Record<string, string>;
  workingDirectory?: string;
  retryConfig?: { maxAttempts?: number; delayMs?: number };
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
    private readonly templateEngine: TemplateEngine,
    private readonly cancellationRegistry?: CancellationRegistry,
    private readonly ruleValidator?: RuleValidator,
    private readonly workflowLoader?: WorkflowLoader
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
        skills: workflow.skills,
        limits: workflow.limits,
        workingDirectory: workflow.workingDirectory
      };
      const mergedConfig = this.configMergeService.mergeWorkflowConfig(globalConfig, workflowConfigRef);

      for (let i = 0; i < workflow.steps.length; i++) {
        if (this.cancellationRegistry?.isCancellationRequested(executionId)) {
          this.cancellationRegistry.clear(executionId);
          this.executionRepository.updateStatus(executionId, 'cancelled', '用户取消');
          return;
        }

        const step = workflow.steps[i];
        const onFailure = step.onFailure || workflow.onFailure;

        let stepResult: StepRunResult;
        if (step.type === 'subWorkflow') {
          stepResult = await this.runSubWorkflowStep(
            step, i, executionId, context
          );
        } else if (step.type === 'dataSplit') {
          stepResult = await this.runDataSplitStep(
            step, i, executionId, workflow, mergedConfig, context
          );
        } else if (step.type === 'forEach') {
          stepResult = await this.runForEachStep(
            step, i, executionId, workflow, mergedConfig, context
          );
        } else {
          stepResult = await this.runStep(
            step, i, executionId, workflow, mergedConfig, context
          );
        }

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
    step: AgentStepRef,
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
      skills: workflow.skills,
      limits: workflow.limits,
      workingDirectory: workflow.workingDirectory
    };
    const stepConfigRef: StepConfigRef = {
      model: step.model,
      maxTurns: step.maxTurns,
      skillIds: step.skillIds
    };
    const stepConfig = this.configMergeService.buildStepMergedConfig(
      mergedConfig, workflowConfigRef, stepConfigRef, executionId, stepIndex
    );

    // 4. 执行步骤（含事件收集）+ 验证（含重试）
    const collectedEvents: StepEvent[] = [];
    const onEvent = (event: StepEvent) => {
      collectedEvents.push(event);
      this.progressNotifier.broadcastStepEvent(executionId, stepIndex, event);
      // 每个 turn 结束时增量保存事件到数据库，防止页面重进后丢失
      if (event.type === 'turn_end') {
        this.executionRepository.updateStepExecution(stepExecution.id, {
          eventsJson: JSON.stringify(collectedEvents)
        });
      }
    };

    let result!: StepResult;
    const onFailure = step.onFailure || workflow.onFailure;
    let validationStatus: 'passed' | 'failed' | undefined;
    let validationOutput: string | undefined;
    let validationTokens = 0;

    const hasValidation = step.validation && (step.validation.prompt || (step.validation.rules && step.validation.rules.length > 0));
    const maxValidationAttempts = (onFailure === 'retry' && hasValidation)
      ? (step.retryConfig?.maxAttempts || workflow.retryConfig?.maxAttempts || DEFAULT_RETRY_MAX_ATTEMPTS)
      : 1;
    const validationDelayMs = step.retryConfig?.delayMs || workflow.retryConfig?.delayMs || DEFAULT_RETRY_DELAY_MS;

    try {
      let currentPrompt = renderedPrompt;

      for (let attempt = 1; attempt <= maxValidationAttempts; attempt++) {
        // 4a. 执行步骤
        if (onFailure === 'retry' && !hasValidation) {
          const maxAttempts = step.retryConfig?.maxAttempts || workflow.retryConfig?.maxAttempts || DEFAULT_RETRY_MAX_ATTEMPTS;
          const delayMs = step.retryConfig?.delayMs || workflow.retryConfig?.delayMs || DEFAULT_RETRY_DELAY_MS;
          result = await this.executeWithRetry(currentPrompt, stepConfig, maxAttempts, delayMs, onEvent);
        } else if (stepConfig.timeoutMs) {
          result = await this.stepExecutor.executeWithTimeout(currentPrompt, stepConfig, stepConfig.timeoutMs, onEvent);
        } else {
          result = await this.stepExecutor.execute(currentPrompt, stepConfig, onEvent);
        }

        if (!result.success) break;

        // 4b. 规则验证（快速，无成本）
        if (step.validation?.rules && step.validation.rules.length > 0 && this.ruleValidator) {
          const ruleResult = this.ruleValidator.validate(result.outputText, step.validation.rules);
          if (!ruleResult.passed) {
            validationStatus = 'failed';
            validationOutput = ruleResult.reason;
            if (attempt < maxValidationAttempts) {
              currentPrompt = `${renderedPrompt}\n\n前次输出未通过验证，原因: ${ruleResult.reason}\n请重新生成符合要求的输出。`;
              await this.delay(validationDelayMs * Math.pow(2, attempt - 1));
              continue;
            }
            result = { ...result, success: false, errorMessage: `规则验证失败: ${ruleResult.reason}` };
            break;
          }
        }

        // 4c. LLM 验证
        if (result.success && step.validation?.prompt) {
          this.progressNotifier.broadcast({
            executionId, stepIndex, status: 'running', outputText: result.outputText
          });

          const validation = await this.stepExecutor.validateOutput(result.outputText, step.validation.prompt, stepConfig);
          validationStatus = validation.passed ? 'passed' : 'failed';
          validationOutput = validation.output;
          validationTokens += validation.tokensUsed;

          if (!validation.passed) {
            if (attempt < maxValidationAttempts) {
              currentPrompt = `${renderedPrompt}\n\n前次输出未通过验证，原因: ${validation.output}\n请重新生成符合要求的输出。`;
              await this.delay(validationDelayMs * Math.pow(2, attempt - 1));
              continue;
            }
            result = { ...result, success: false, errorMessage: `验证失败: ${validation.output}` };
          }
        }

        // If we reach here without continue, validation passed or no validation
        if (result.success && hasValidation && !validationStatus) {
          validationStatus = 'passed';
        }
        break;
      }
    } finally {
      if (stepConfig.skillsDir) {
        this.configMergeService.cleanupStepSkills(stepConfig.skillsDir);
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
   * 执行子工作流步骤（含 forEach 循环）
   *
   * 加载子工作流定义 → 解析输入映射 → 单次/forEach 执行 → 收集输出
   */
  private async runSubWorkflowStep(
    step: SubWorkflowStepRef,
    stepIndex: number,
    executionId: string,
    context: TemplateContext
  ): Promise<StepRunResult> {
    // 1. 创建步骤执行记录
    this.executionRepository.updateCurrentStep(executionId, stepIndex);
    const stepExecution = this.executionRepository.createStepExecution(
      executionId, stepIndex, `[subWorkflow] ${step.workflowId}`
    );
    this.progressNotifier.broadcastStepStart(executionId, stepIndex);

    // 2. 加载子工作流定义
    if (!this.workflowLoader) {
      return this.failSubWorkflowStep(stepExecution.id, step, stepIndex, executionId, context, 'WorkflowLoader 未注入');
    }

    const subWorkflow = this.workflowLoader.loadWorkflow(step.workflowId);
    if (!subWorkflow) {
      return this.failSubWorkflowStep(stepExecution.id, step, stepIndex, executionId, context, `子工作流不存在: ${step.workflowId}`);
    }

    // 3. 解析输入映射
    const mappedInputs: Record<string, unknown> = {};
    if (step.inputMapping) {
      for (const [key, expr] of Object.entries(step.inputMapping)) {
        mappedInputs[key] = this.templateEngine.render(expr, context);
      }
    }

    try {
      let outputText: string;
      let totalTokens = 0;

      if (step.forEach) {
        // 4a. forEach 模式：串行遍历列表
        const rawItems = this.templateEngine.render(step.forEach.iterateOver, context);
        let items: unknown[];
        try {
          items = JSON.parse(rawItems);
          if (!Array.isArray(items)) {
            return this.failSubWorkflowStep(stepExecution.id, step, stepIndex, executionId, context,
              `forEach.iterateOver 解析结果不是数组: ${typeof items}`);
          }
        } catch {
          return this.failSubWorkflowStep(stepExecution.id, step, stepIndex, executionId, context,
            `forEach.iterateOver 无法解析为 JSON 数组: ${rawItems.substring(0, 200)}`);
        }

        const iterationOutputs: string[] = [];
        for (let i = 0; i < items.length; i++) {
          // 检查取消
          if (this.cancellationRegistry?.isCancellationRequested(executionId)) {
            return this.failSubWorkflowStep(stepExecution.id, step, stepIndex, executionId, context, '用户取消');
          }

          const iterInputs = {
            ...mappedInputs,
            [step.forEach.itemVariable]: items[i]
          };

          const iterResult = await this.executeSubWorkflow(
            subWorkflow, iterInputs, executionId, stepIndex, i
          );
          totalTokens += iterResult.tokensUsed;

          if (!iterResult.success) {
            const onFailure = step.onFailure || 'stop';
            if (onFailure === 'stop') {
              return this.failSubWorkflowStep(stepExecution.id, step, stepIndex, executionId, context,
                `迭代 ${i} 失败: ${iterResult.errorMessage}`, totalTokens);
            }
            iterationOutputs.push('');
          } else {
            iterationOutputs.push(iterResult.outputText);
          }
        }
        outputText = JSON.stringify(iterationOutputs);
      } else {
        // 4b. 单次调用
        const result = await this.executeSubWorkflow(
          subWorkflow, mappedInputs, executionId, stepIndex
        );
        totalTokens = result.tokensUsed;

        if (!result.success) {
          return this.failSubWorkflowStep(stepExecution.id, step, stepIndex, executionId, context,
            result.errorMessage, totalTokens);
        }
        outputText = result.outputText;
      }

      // 5. 更新步骤执行记录
      this.executionRepository.updateStepExecution(stepExecution.id, {
        status: 'success',
        outputText,
        tokensUsed: totalTokens
      });
      this.executionRepository.addTokens(executionId, totalTokens);

      context.steps![step.name] = { output: outputText };

      this.progressNotifier.broadcastStepResult(
        executionId, stepIndex, true, outputText, totalTokens
      );

      return { success: true, tokensUsed: totalTokens, outputText };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.failSubWorkflowStep(stepExecution.id, step, stepIndex, executionId, context, errorMessage);
    }
  }

  /**
   * 执行 ForEach 循环步骤
   *
   * 解析 iterateOver 为 JSON 数组 → 串行遍历 → 每次迭代构造新 context 并调用 runStep → 收集输出
   */
  private async runForEachStep(
    step: ForEachStepRef,
    stepIndex: number,
    executionId: string,
    workflow: WorkflowRef,
    mergedConfig: MergedConfig,
    context: TemplateContext
  ): Promise<StepRunResult> {
    this.executionRepository.updateCurrentStep(executionId, stepIndex);
    const stepExecution = this.executionRepository.createStepExecution(
      executionId, stepIndex, `[forEach] ${step.name}`
    );
    this.progressNotifier.broadcastStepStart(executionId, stepIndex);

    // 构建步骤级配置（所有迭代共用）
    const workflowConfigRef: WorkflowConfigRef = {
      rules: workflow.rules, skills: workflow.skills,
      limits: workflow.limits, workingDirectory: workflow.workingDirectory
    };
    const stepConfigRef: StepConfigRef = {
      model: step.model, maxTurns: step.maxTurns, skillIds: step.skillIds
    };
    const stepConfig = this.configMergeService.buildStepMergedConfig(
      mergedConfig, workflowConfigRef, stepConfigRef, executionId, stepIndex
    );

    try {
      // 1. 解析数组
      const rawItems = this.templateEngine.render(step.iterateOver, context);
      let items: unknown[];
      try {
        items = JSON.parse(rawItems);
        if (!Array.isArray(items)) {
          return this.failForEachStep(stepExecution.id, step, stepIndex, executionId, context,
            `iterateOver 解析结果不是数组: ${typeof items}`);
        }
      } catch {
        return this.failForEachStep(stepExecution.id, step, stepIndex, executionId, context,
          `iterateOver 无法解析为 JSON 数组: ${rawItems.substring(0, 200)}`);
      }

      // 2. 串行遍历，每次迭代创建独立子执行
      const iterationOutputs: string[] = [];
      let totalTokens = 0;

      for (let i = 0; i < items.length; i++) {
        if (this.cancellationRegistry?.isCancellationRequested(executionId)) {
          return this.failForEachStep(stepExecution.id, step, stepIndex, executionId, context,
            '用户取消', totalTokens);
        }

        // 构造迭代 context，渲染 prompt
        const iterContext: TemplateContext = {
          inputs: { ...context.inputs, [step.itemVariable]: items[i] },
          steps: { ...context.steps }
        };
        const renderedPrompt = this.templateEngine.render(step.prompt, iterContext);

        // 创建子执行记录（独立 Execution + StepExecution）
        const childExec = this.executionRepository.create(
          workflow.id, 'manual',
          { parentExecutionId: executionId, parentStepIndex: stepIndex, iterationIndex: i }
        );
        this.executionRepository.updateStatus(childExec.id, 'running');
        const childStepExec = this.executionRepository.createStepExecution(
          childExec.id, 0, renderedPrompt
        );

        // 通知前端迭代进度（父步骤 + 子执行开始）
        const childParentInfo = {
          parentExecutionId: executionId, parentStepIndex: stepIndex, iterationIndex: i
        };
        this.progressNotifier.broadcast({
          executionId, stepIndex, status: 'running',
          outputText: `迭代 ${i + 1}/${items.length}: ${renderedPrompt.substring(0, 80)}`
        });
        this.progressNotifier.broadcast({
          executionId: childExec.id, stepIndex: 0, status: 'running', ...childParentInfo
        });

        // 执行，事件广播到子执行
        const collectedEvents: StepEvent[] = [];
        const onEvent = (event: StepEvent) => {
          collectedEvents.push(event);
          this.progressNotifier.broadcastStepEvent(childExec.id, 0, event);
          if (event.type === 'turn_end') {
            this.executionRepository.updateStepExecution(childStepExec.id, {
              eventsJson: JSON.stringify(collectedEvents)
            });
          }
        };
        const result = await this.stepExecutor.execute(renderedPrompt, stepConfig, onEvent);
        totalTokens += result.tokensUsed;

        // 更新子执行记录（含 eventsJson 持久化）
        this.executionRepository.updateStepExecution(childStepExec.id, {
          status: result.success ? 'success' : 'failed',
          outputText: result.outputText,
          tokensUsed: result.tokensUsed,
          errorMessage: result.errorMessage,
          eventsJson: JSON.stringify(collectedEvents)
        });
        this.executionRepository.addTokens(childExec.id, result.tokensUsed);
        this.executionRepository.updateStatus(
          childExec.id,
          result.success ? 'success' : 'failed',
          result.errorMessage
        );
        // 广播子执行完成（携带 parentInfo）
        this.progressNotifier.broadcast({
          executionId: childExec.id, stepIndex: 0,
          status: result.success ? 'success' : 'failed',
          outputText: result.outputText, tokensUsed: result.tokensUsed,
          errorMessage: result.errorMessage, ...childParentInfo
        });

        if (!result.success) {
          const onFailure = step.onFailure || workflow.onFailure;
          if (onFailure === 'stop') {
            return this.failForEachStep(stepExecution.id, step, stepIndex, executionId, context,
              `迭代 ${i} 失败: ${result.errorMessage}`, totalTokens);
          }
          iterationOutputs.push('');
        } else {
          iterationOutputs.push(result.outputText);
        }
      }

      // 3. 更新父 forEach 步骤记录
      const outputText = JSON.stringify(iterationOutputs);
      this.executionRepository.updateStepExecution(stepExecution.id, {
        status: 'success',
        outputText: `共 ${items.length} 次迭代完成`,
        tokensUsed: totalTokens
      });
      this.executionRepository.addTokens(executionId, totalTokens);

      context.steps![step.name] = { output: outputText };

      this.progressNotifier.broadcastStepResult(
        executionId, stepIndex, true, outputText, totalTokens
      );

      if (stepConfig.skillsDir) {
        this.configMergeService.cleanupStepSkills(stepConfig.skillsDir);
      }

      return { success: true, tokensUsed: totalTokens, outputText };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.failForEachStep(stepExecution.id, step, stepIndex, executionId, context, errorMessage);
    }
  }

  private failForEachStep(
    stepExecId: string,
    step: ForEachStepRef,
    stepIndex: number,
    executionId: string,
    context: TemplateContext,
    errorMessage?: string,
    tokensUsed = 0
  ): StepRunResult {
    this.executionRepository.updateStepExecution(stepExecId, {
      status: 'failed',
      errorMessage,
      tokensUsed
    });
    context.steps![step.name] = { output: '' };
    this.progressNotifier.broadcastStepResult(executionId, stepIndex, false, '', tokensUsed, errorMessage);
    return { success: false, tokensUsed, outputText: '', errorMessage };
  }

  /**
   * 执行数据拆分步骤
   *
   * static 模式: 直接解析 JSON 数组
   * template 模式: 模板渲染后解析 JSON 数组
   * ai 模式: 调用 AI 拆分并从输出中提取 JSON 数组
   */
  private async runDataSplitStep(
    step: DataSplitStepRef,
    stepIndex: number,
    executionId: string,
    workflow: WorkflowRef,
    mergedConfig: MergedConfig,
    context: TemplateContext
  ): Promise<StepRunResult> {
    this.executionRepository.updateCurrentStep(executionId, stepIndex);
    const stepExecution = this.executionRepository.createStepExecution(
      executionId, stepIndex, `[dataSplit:${step.mode}] ${step.name}`
    );
    this.progressNotifier.broadcastStepStart(executionId, stepIndex);

    try {
      let outputText: string;
      let tokensUsed = 0;
      let eventsJson: string | undefined;

      if (step.mode === 'static') {
        const raw = step.staticData || '';
        const array = this.parseJsonArray(raw, 'staticData');
        outputText = JSON.stringify(array);
      } else if (step.mode === 'template') {
        const rendered = this.templateEngine.render(step.templateExpr || '', context);
        const array = this.parseJsonArray(rendered, 'templateExpr');
        outputText = JSON.stringify(array);
      } else {
        // ai mode
        const renderedInput = this.templateEngine.render(step.aiInput || '', context);
        const defaultPrompt = '请将以下内容拆分为独立的子任务列表。只输出 JSON 数组，格式为 ["任务1", "任务2", ...]，不要输出其他内容。';
        const aiPrompt = step.aiPrompt || defaultPrompt;
        const fullPrompt = `${aiPrompt}\n\n${renderedInput}`;

        const workflowConfigRef: WorkflowConfigRef = {
          rules: workflow.rules,
          skills: workflow.skills,
          limits: workflow.limits,
          workingDirectory: workflow.workingDirectory
        };
        const stepConfigRef: StepConfigRef = {};
        const stepConfig = this.configMergeService.buildStepMergedConfig(
          mergedConfig, workflowConfigRef, stepConfigRef, executionId, stepIndex
        );

        const collectedEvents: StepEvent[] = [];
        const onEvent = (event: StepEvent) => {
          collectedEvents.push(event);
          this.progressNotifier.broadcastStepEvent(executionId, stepIndex, event);
          if (event.type === 'turn_end') {
            this.executionRepository.updateStepExecution(stepExecution.id, {
              eventsJson: JSON.stringify(collectedEvents)
            });
          }
        };
        const result = await this.stepExecutor.execute(fullPrompt, stepConfig, onEvent);
        tokensUsed = result.tokensUsed;

        if (!result.success) {
          // 保存已收集的事件
          this.executionRepository.updateStepExecution(stepExecution.id, {
            status: 'failed',
            errorMessage: result.errorMessage || 'AI 拆分执行失败',
            tokensUsed,
            eventsJson: JSON.stringify(collectedEvents)
          });
          if (stepConfig.skillsDir) {
            this.configMergeService.cleanupStepSkills(stepConfig.skillsDir);
          }
          throw new Error(result.errorMessage || 'AI 拆分执行失败');
        }

        // Extract JSON array from AI output
        const array = this.extractJsonArray(result.outputText);
        outputText = JSON.stringify(array);
        eventsJson = JSON.stringify(collectedEvents);

        if (stepConfig.skillsDir) {
          this.configMergeService.cleanupStepSkills(stepConfig.skillsDir);
        }
      }

      this.executionRepository.updateStepExecution(stepExecution.id, {
        status: 'success',
        outputText,
        tokensUsed,
        eventsJson
      });
      this.executionRepository.addTokens(executionId, tokensUsed);

      context.steps![step.name] = { output: outputText };

      this.progressNotifier.broadcastStepResult(
        executionId, stepIndex, true, outputText, tokensUsed
      );

      return { success: true, tokensUsed, outputText };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.executionRepository.updateStepExecution(stepExecution.id, {
        status: 'failed',
        errorMessage,
        tokensUsed: 0
      });
      context.steps![step.name] = { output: '' };
      this.progressNotifier.broadcastStepResult(executionId, stepIndex, false, '', 0, errorMessage);
      return { success: false, tokensUsed: 0, outputText: '', errorMessage };
    }
  }

  /**
   * 解析 JSON 数组，失败时抛出描述性错误
   */
  private parseJsonArray(raw: string, fieldName: string): unknown[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`${fieldName} 无法解析为 JSON: ${raw.substring(0, 200)}`);
    }
    if (!Array.isArray(parsed)) {
      throw new Error(`${fieldName} 解析结果不是数组: ${typeof parsed}`);
    }
    return parsed;
  }

  /**
   * 从 AI 输出文本中提取 JSON 数组
   */
  private extractJsonArray(text: string): unknown[] {
    // 逐个尝试从文本中每个 '[' 开始解析 JSON 数组
    for (let i = 0; i < text.length; i++) {
      if (text[i] !== '[') continue;
      // 从当前 '[' 向后找每个 ']'，尝试解析
      for (let j = text.indexOf(']', i); j !== -1; j = text.indexOf(']', j + 1)) {
        const candidate = text.substring(i, j + 1);
        try {
          const parsed = JSON.parse(candidate);
          if (Array.isArray(parsed)) return parsed;
        } catch {
          continue;
        }
      }
    }
    throw new Error(`AI 输出中未找到 JSON 数组: ${text.substring(0, 200)}`);
  }

  /**
   * 子工作流步骤失败的统一处理
   */
  private failSubWorkflowStep(
    stepExecId: string,
    step: SubWorkflowStepRef,
    stepIndex: number,
    executionId: string,
    context: TemplateContext,
    errorMessage?: string,
    tokensUsed = 0
  ): StepRunResult {
    this.executionRepository.updateStepExecution(stepExecId, {
      status: 'failed',
      errorMessage,
      tokensUsed
    });
    context.steps![step.name] = { output: '' };
    this.progressNotifier.broadcastStepResult(executionId, stepIndex, false, '', tokensUsed, errorMessage);
    return { success: false, tokensUsed, outputText: '', errorMessage };
  }

  /**
   * 执行子工作流（同步等待完成）
   *
   * 创建子 Execution → 运行子流水线 → 返回最后步骤输出
   */
  private async executeSubWorkflow(
    subWorkflow: WorkflowRef,
    inputs: Record<string, unknown>,
    parentExecutionId: string,
    parentStepIndex: number,
    iterationIndex?: number
  ): Promise<StepRunResult> {
    const subExecution = this.executionRepository.create(
      subWorkflow.id, 'manual',
      { parentExecutionId, parentStepIndex, iterationIndex }
    );

    const context: TemplateContext = { inputs, steps: {} };
    let totalTokens = 0;

    const parentInfo = { parentExecutionId, parentStepIndex, iterationIndex };

    try {
      this.executionRepository.updateStatus(subExecution.id, 'running');
      // 通知前端子执行开始
      this.progressNotifier.broadcast({
        executionId: subExecution.id, stepIndex: 0, status: 'running', ...parentInfo
      });

      const globalConfig = this.configMergeService.loadGlobalConfig();
      const workflowConfigRef: WorkflowConfigRef = {
        rules: subWorkflow.rules,
        skills: subWorkflow.skills,
        limits: subWorkflow.limits,
        workingDirectory: subWorkflow.workingDirectory
      };
      const mergedConfig = this.configMergeService.mergeWorkflowConfig(globalConfig, workflowConfigRef);

      let lastOutput = '';

      for (let i = 0; i < subWorkflow.steps.length; i++) {
        if (this.cancellationRegistry?.isCancellationRequested(parentExecutionId)) {
          this.executionRepository.updateStatus(subExecution.id, 'cancelled', '父流程取消');
          this.progressNotifier.broadcast({
            executionId: subExecution.id, stepIndex: i, status: 'cancelled',
            errorMessage: '父流程取消', ...parentInfo
          });
          return { success: false, tokensUsed: totalTokens, outputText: '', errorMessage: '父流程取消' };
        }

        const step = subWorkflow.steps[i];

        let stepResult: StepRunResult;
        if (step.type === 'subWorkflow') {
          stepResult = await this.runSubWorkflowStep(step, i, subExecution.id, context);
        } else if (step.type === 'dataSplit') {
          stepResult = await this.runDataSplitStep(step, i, subExecution.id, subWorkflow, mergedConfig, context);
        } else if (step.type === 'forEach') {
          stepResult = await this.runForEachStep(step, i, subExecution.id, subWorkflow, mergedConfig, context);
        } else {
          stepResult = await this.runStep(step, i, subExecution.id, subWorkflow, mergedConfig, context);
        }

        totalTokens += stepResult.tokensUsed;

        if (!stepResult.success) {
          const onFailure = step.onFailure || subWorkflow.onFailure;
          if (onFailure === 'skip') continue;
          this.executionRepository.updateStatus(subExecution.id, 'failed', stepResult.errorMessage);
          this.progressNotifier.broadcast({
            executionId: subExecution.id, stepIndex: i, status: 'failed',
            errorMessage: stepResult.errorMessage, ...parentInfo
          });
          return { success: false, tokensUsed: totalTokens, outputText: '', errorMessage: stepResult.errorMessage };
        }

        lastOutput = stepResult.outputText;

        if (subWorkflow.limits?.maxTokens && totalTokens >= subWorkflow.limits.maxTokens) {
          this.executionRepository.updateStatus(subExecution.id, 'failed', 'Token limit exceeded');
          this.progressNotifier.broadcast({
            executionId: subExecution.id, stepIndex: i, status: 'failed',
            errorMessage: 'Token limit exceeded', ...parentInfo
          });
          return { success: false, tokensUsed: totalTokens, outputText: '', errorMessage: 'Token limit exceeded' };
        }
      }

      this.executionRepository.updateStatus(subExecution.id, 'success');
      // 通知前端子执行完成
      this.progressNotifier.broadcast({
        executionId: subExecution.id, stepIndex: subWorkflow.steps.length - 1,
        status: 'success', tokensUsed: totalTokens, ...parentInfo
      });
      return { success: true, tokensUsed: totalTokens, outputText: lastOutput };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.executionRepository.updateStatus(subExecution.id, 'failed', errorMessage);
      this.progressNotifier.broadcast({
        executionId: subExecution.id, stepIndex: 0, status: 'failed',
        errorMessage, ...parentInfo
      });
      return { success: false, tokensUsed: totalTokens, outputText: '', errorMessage };
    }
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
