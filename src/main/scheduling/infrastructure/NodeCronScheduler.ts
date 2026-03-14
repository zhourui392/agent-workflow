/**
 * node-cron 调度器实现
 */

import cron from 'node-cron';
import log from 'electron-log';
import type { SchedulerService } from '../domain/service/SchedulerService';

export class NodeCronScheduler implements SchedulerService {
  private readonly scheduledJobs = new Map<string, cron.ScheduledTask>();

  register(workflowId: string, schedule: string, callback: () => Promise<void>): void {
    this.unregister(workflowId);

    if (!cron.validate(schedule)) {
      log.warn(`Invalid cron expression for workflow ${workflowId}: ${schedule}`);
      return;
    }

    const task = cron.schedule(schedule, async () => {
      log.info(`Scheduled execution triggered for workflow: ${workflowId}`);
      try {
        await callback();
      } catch (error) {
        log.error(`Scheduled execution failed for workflow ${workflowId}:`, error);
      }
    });

    this.scheduledJobs.set(workflowId, task);
    log.info(`Registered cron job for workflow ${workflowId}: ${schedule}`);
  }

  unregister(workflowId: string): void {
    const existingTask = this.scheduledJobs.get(workflowId);
    if (existingTask) {
      existingTask.stop();
      this.scheduledJobs.delete(workflowId);
      log.info(`Unregistered cron job for workflow: ${workflowId}`);
    }
  }

  stopAll(): void {
    log.info('Stopping all cron jobs...');

    for (const [workflowId, task] of this.scheduledJobs) {
      task.stop();
      log.debug(`Stopped cron job: ${workflowId}`);
    }

    this.scheduledJobs.clear();
    log.info('All cron jobs stopped');
  }

  getScheduledCount(): number {
    return this.scheduledJobs.size;
  }
}
