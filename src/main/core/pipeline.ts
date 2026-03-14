/**
 * 多步骤流水线编排器
 *
 * 职责：步骤迭代、失败策略、token 限制、输出处理
 * 具体步骤执行委托给 stepRunner
 *
 * @author zhourui(V33215020)
 * @since 2026/03/11
 */

import log from 'electron-log';
import { executionRepository } from '../store/repositories';
import type {
  Workflow,
  ExecutionResult,
  TriggerType
} from '../store/models';
import type { TemplateContext } from './template';
import { mergeConfig } from './config/configMerger';
import { getCachedGlobalConfig } from './config/globalConfigCache';
import { handleOutput } from './outputHandler';
import { ProgressBroadcaster } from './pipeline/progressBroadcaster';
import { runStep } from './pipeline/stepRunner';

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
  const context: TemplateContext = { inputs, steps: {} };
  let totalTokens = 0;
  const broadcaster = new ProgressBroadcaster();

  try {
    executionRepository.updateStatus(executionId, 'running');

    const globalConfig = getCachedGlobalConfig();
    const mergedConfig = mergeConfig(globalConfig, workflow);

    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      const onFailure = step.onFailure || workflow.onFailure;

      const stepResult = await runStep(
        step, i, executionId, workflow, mergedConfig, context, broadcaster
      );

      totalTokens += stepResult.tokensUsed;

      // 步骤失败处理
      if (!stepResult.success) {
        if (onFailure === 'skip') {
          log.warn(`Step ${step.name} failed, skipping to next step`);
          continue;
        }

        const reason = onFailure === 'stop'
          ? `Step ${step.name} failed, stopping pipeline`
          : `Step ${step.name} failed after retries, stopping pipeline`;
        log.error(reason);
        executionRepository.updateStatus(executionId, 'failed', stepResult.errorMessage);
        return;
      }

      // Token 限制检查
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
  const outputs: Record<string, unknown> = { inputs: context.inputs };

  if (context.steps) {
    for (const [stepName, stepData] of Object.entries(context.steps)) {
      outputs[`steps.${stepName}.output`] = stepData.output;
    }
  }

  return outputs;
}
