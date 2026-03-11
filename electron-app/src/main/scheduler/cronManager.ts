/**
 * Cron定时任务管理器
 *
 * @author zhourui(V33215020)
 * @since 2026/03/11
 */

import cron from 'node-cron';
import log from 'electron-log';
import { workflowRepository } from '../store/repositories';
import { executePipeline } from '../core/pipeline';
import type { Workflow } from '../store/models';

const scheduledJobs = new Map<string, cron.ScheduledTask>();

/**
 * 注册工作流定时任务
 *
 * @param workflow 工作流对象
 */
export function registerWorkflow(workflow: Workflow): void {
  unregisterWorkflow(workflow.id);

  if (!workflow.enabled || !workflow.schedule) {
    return;
  }

  if (!cron.validate(workflow.schedule)) {
    log.warn(`Invalid cron expression for workflow ${workflow.id}: ${workflow.schedule}`);
    return;
  }

  const task = cron.schedule(workflow.schedule, async () => {
    log.info(`Scheduled execution triggered for workflow: ${workflow.name}`);
    try {
      await executePipeline(workflow, {}, 'scheduled');
    } catch (error) {
      log.error(`Scheduled execution failed for workflow ${workflow.name}:`, error);
    }
  });

  scheduledJobs.set(workflow.id, task);
  log.info(`Registered cron job for workflow ${workflow.name}: ${workflow.schedule}`);
}

/**
 * 取消注册工作流定时任务
 *
 * @param workflowId 工作流ID
 */
export function unregisterWorkflow(workflowId: string): void {
  const existingTask = scheduledJobs.get(workflowId);
  if (existingTask) {
    existingTask.stop();
    scheduledJobs.delete(workflowId);
    log.info(`Unregistered cron job for workflow: ${workflowId}`);
  }
}

/**
 * 同步所有工作流的定时任务
 *
 * 从数据库加载所有启用且有定时表达式的工作流，并注册定时任务
 */
export function syncAllWorkflows(): void {
  log.info('Syncing all workflow cron jobs...');

  for (const [workflowId] of scheduledJobs) {
    unregisterWorkflow(workflowId);
  }

  const workflows = workflowRepository.findEnabledWithSchedule();

  for (const workflow of workflows) {
    registerWorkflow(workflow);
  }

  log.info(`Synced ${workflows.length} workflow cron jobs`);
}

/**
 * 停止所有定时任务
 */
export function stopAll(): void {
  log.info('Stopping all cron jobs...');

  for (const [workflowId, task] of scheduledJobs) {
    task.stop();
    log.debug(`Stopped cron job: ${workflowId}`);
  }

  scheduledJobs.clear();
  log.info('All cron jobs stopped');
}

/**
 * 获取当前注册的定时任务数量
 *
 * @returns 定时任务数量
 */
export function getScheduledCount(): number {
  return scheduledJobs.size;
}
