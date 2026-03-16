/**
 * 执行断点重试用例
 *
 * 加载失败的执行记录，校验状态，委托编排器从失败步骤继续执行。
 *
 * @author zhourui
 * @since 2026/03/17
 */

import type { ExecutionRepository } from '../domain/repository/ExecutionRepository';
import type { PipelineOrchestrator, WorkflowLoader } from '../domain/service/PipelineOrchestrator';
import type { RunOptions } from '../domain/model/RunOptions';

export class RetryExecutionUseCase {
  constructor(
    private readonly executionRepo: ExecutionRepository,
    private readonly orchestrator: PipelineOrchestrator,
    private readonly workflowLoader: WorkflowLoader
  ) {}

  async retry(executionId: string, options?: RunOptions): Promise<string> {
    const sourceExecution = this.executionRepo.findByIdWithSteps(executionId);
    if (!sourceExecution) {
      throw new Error('执行记录不存在');
    }
    if (sourceExecution.status !== 'failed') {
      throw new Error('仅失败的执行可以重试');
    }

    const workflow = this.workflowLoader.loadWorkflow(sourceExecution.workflowId);
    if (!workflow) {
      throw new Error('工作流已删除，无法重试');
    }

    // 还原原始 inputs
    let inputs: Record<string, unknown> = {};
    if (sourceExecution.inputsJson) {
      try {
        inputs = JSON.parse(sourceExecution.inputsJson);
      } catch {
        inputs = {};
      }
    }

    return this.orchestrator.retryFromFailedStep(workflow, sourceExecution, inputs, options);
  }
}
