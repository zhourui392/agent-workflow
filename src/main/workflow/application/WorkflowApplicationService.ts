/**
 * 工作流应用服务
 */

import log from 'electron-log';
import type { Workflow, CreateWorkflowRequest, UpdateWorkflowRequest } from '../domain/model';
import type { WorkflowRepository } from '../domain/repository/WorkflowRepository';

/**
 * 调度服务接口（跨上下文引用，避免循环依赖）
 */
export interface SchedulerPort {
  register(workflowId: string, schedule: string, callback: () => Promise<void>): void;
  unregister(workflowId: string): void;
}

/**
 * 执行流水线接口（跨上下文引用）
 */
export interface PipelinePort {
  execute(workflow: Workflow, inputs: Record<string, unknown>, triggerType: 'manual' | 'scheduled'): Promise<string>;
}

export class WorkflowApplicationService {
  constructor(
    private readonly repo: WorkflowRepository,
    private readonly scheduler: SchedulerPort,
    private readonly pipeline: PipelinePort
  ) {}

  list(): Workflow[] {
    return this.repo.findAll();
  }

  get(id: string): Workflow | null {
    return this.repo.findById(id);
  }

  create(data: CreateWorkflowRequest): Workflow {
    const workflow = this.repo.create(data);
    log.info(`Created workflow: ${workflow.id} - ${workflow.name}`);
    this.syncScheduler(workflow);
    return workflow;
  }

  update(id: string, data: UpdateWorkflowRequest): Workflow | null {
    const workflow = this.repo.update(id, data);
    if (!workflow) return null;

    log.info(`Updated workflow: ${id}`);
    this.syncScheduler(workflow);
    return workflow;
  }

  remove(id: string): boolean {
    this.scheduler.unregister(id);
    const result = this.repo.remove(id);
    if (result) log.info(`Deleted workflow: ${id}`);
    return result;
  }

  toggle(id: string): Workflow | null {
    const workflow = this.repo.toggle(id);
    if (!workflow) return null;

    log.info(`Toggled workflow ${id}: enabled=${workflow.enabled}`);

    if (workflow.enabled) {
      this.syncScheduler(workflow);
    } else {
      this.scheduler.unregister(id);
    }

    return workflow;
  }

  async run(id: string, inputs: Record<string, unknown> = {}): Promise<string | null> {
    const workflow = this.repo.findById(id);
    if (!workflow) return null;

    log.info(`Manual execution triggered for workflow: ${workflow.name}`);
    return this.pipeline.execute(workflow, inputs, 'manual');
  }

  private syncScheduler(workflow: Workflow): void {
    if (workflow.isSchedulable) {
      this.scheduler.register(workflow.id, workflow.schedule!, async () => {
        await this.pipeline.execute(workflow, {}, 'scheduled');
      });
    } else {
      this.scheduler.unregister(workflow.id);
    }
  }
}
