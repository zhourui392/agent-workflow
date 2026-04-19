/**
 * WorkflowLoader 适配器
 *
 * 将 WorkflowRepository.findById 适配为 WorkflowLoader 接口，
 * 实现跨限界上下文的工作流加载。
 */

import type { WorkflowRepository } from '../../workflow/domain/repository/WorkflowRepository';
import type { WorkflowLoader, WorkflowRef } from '../domain/service/PipelineOrchestrator';

export class WorkflowLoaderAdapter implements WorkflowLoader {
  constructor(private readonly workflowRepo: WorkflowRepository) {}

  loadWorkflow(workflowId: string): WorkflowRef | null {
    const workflow = this.workflowRepo.findById(workflowId);
    if (!workflow) return null;

    return {
      id: workflow.id,
      name: workflow.name,
      steps: workflow.steps,
      onFailure: workflow.onFailure,
      limits: workflow.limits,
      output: workflow.output,
      rules: workflow.rules,
      skills: workflow.skills,
      workingDirectory: workflow.workingDirectory,
      retryConfig: workflow.retryConfig
    };
  }
}
