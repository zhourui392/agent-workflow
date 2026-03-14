/**
 * 执行流水线用例
 *
 * 封装流水线编排器调用，同时实现 PipelinePort 接口，
 * 供 Workflow 限界上下文的 WorkflowApplicationService 跨上下文调用。
 *
 * @author zhourui
 * @since 2026/03/14
 */

import type { Workflow } from '../../workflow/domain/model';
import type { TriggerType } from '../domain/model/ExecutionStatus';
import type { PipelineOrchestrator } from '../domain/service/PipelineOrchestrator';

export class ExecutePipelineUseCase {
  constructor(private readonly orchestrator: PipelineOrchestrator) {}

  async execute(workflow: Workflow, inputs: Record<string, unknown>, triggerType: TriggerType): Promise<string> {
    return this.orchestrator.execute(workflow, inputs, triggerType);
  }
}
