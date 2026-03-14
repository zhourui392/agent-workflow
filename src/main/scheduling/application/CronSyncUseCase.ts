/**
 * 定时任务同步用例
 */

import log from 'electron-log';
import type { WorkflowRepository } from '../../workflow/domain/repository/WorkflowRepository';
import type { SchedulerService } from '../domain/service/SchedulerService';
import type { PipelinePort } from '../../workflow/application/WorkflowApplicationService';

export class CronSyncUseCase {
  constructor(
    private readonly workflowRepo: WorkflowRepository,
    private readonly scheduler: SchedulerService,
    private readonly pipeline: PipelinePort
  ) {}

  syncAll(): void {
    log.info('Syncing all workflow cron jobs...');

    this.scheduler.stopAll();

    const workflows = this.workflowRepo.findEnabledWithSchedule();

    for (const workflow of workflows) {
      if (workflow.schedule) {
        this.scheduler.register(workflow.id, workflow.schedule, async () => {
          await this.pipeline.execute(workflow, {}, 'scheduled');
        });
      }
    }

    log.info(`Synced ${workflows.length} workflow cron jobs`);
  }
}
