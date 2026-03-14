/**
 * CronSyncUseCase 单元测试
 *
 * 验证定时任务同步：清除全部 → 加载已启用工作流 → 逐一注册。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CronSyncUseCase } from '../../src/main/scheduling/application/CronSyncUseCase';
import type { SchedulerService } from '../../src/main/scheduling/domain/service/SchedulerService';
import type { PipelinePort } from '../../src/main/workflow/application/WorkflowApplicationService';
import type { WorkflowRepository } from '../../src/main/workflow/domain/repository/WorkflowRepository';
import { createMockWorkflowRepository, createTestWorkflow } from '../fixtures';

// electron-log 静默
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } }));

function createMockSchedulerService(): SchedulerService {
  return {
    register: vi.fn(),
    unregister: vi.fn(),
    stopAll: vi.fn(),
    getScheduledCount: vi.fn(() => 0),
  };
}

function createMockPipelinePort(): PipelinePort {
  return {
    execute: vi.fn(async () => 'exec-001'),
  };
}

describe('CronSyncUseCase', () => {
  let workflowRepo: ReturnType<typeof createMockWorkflowRepository>;
  let scheduler: ReturnType<typeof createMockSchedulerService>;
  let pipeline: ReturnType<typeof createMockPipelinePort>;
  let useCase: CronSyncUseCase;

  beforeEach(() => {
    workflowRepo = createMockWorkflowRepository();
    scheduler = createMockSchedulerService();
    pipeline = createMockPipelinePort();
    useCase = new CronSyncUseCase(workflowRepo, scheduler, pipeline);
  });

  it('stops all existing jobs before re-registering', () => {
    useCase.syncAll();

    expect(scheduler.stopAll).toHaveBeenCalledOnce();
  });

  it('loads enabled workflows with schedule and registers each', () => {
    const wf1 = createTestWorkflow({ id: 'wf-1', schedule: '0 9 * * *', enabled: true });
    const wf2 = createTestWorkflow({ id: 'wf-2', schedule: '*/30 * * * *', enabled: true });
    (workflowRepo.findEnabledWithSchedule as ReturnType<typeof vi.fn>).mockReturnValue([wf1, wf2]);

    useCase.syncAll();

    expect(workflowRepo.findEnabledWithSchedule).toHaveBeenCalledOnce();
    expect(scheduler.register).toHaveBeenCalledTimes(2);
    expect(scheduler.register).toHaveBeenCalledWith('wf-1', '0 9 * * *', expect.any(Function));
    expect(scheduler.register).toHaveBeenCalledWith('wf-2', '*/30 * * * *', expect.any(Function));
  });

  it('does not register any jobs when no workflows are schedulable', () => {
    (workflowRepo.findEnabledWithSchedule as ReturnType<typeof vi.fn>).mockReturnValue([]);

    useCase.syncAll();

    expect(scheduler.stopAll).toHaveBeenCalledOnce();
    expect(scheduler.register).not.toHaveBeenCalled();
  });

  it('registered callback invokes pipeline.execute with scheduled trigger', async () => {
    const wf = createTestWorkflow({ id: 'wf-1', schedule: '0 9 * * *', enabled: true });
    (workflowRepo.findEnabledWithSchedule as ReturnType<typeof vi.fn>).mockReturnValue([wf]);

    useCase.syncAll();

    // Extract the callback passed to scheduler.register
    const registerCall = (scheduler.register as ReturnType<typeof vi.fn>).mock.calls[0];
    const callback = registerCall[2] as () => Promise<void>;

    await callback();

    expect(pipeline.execute).toHaveBeenCalledWith(wf, {}, 'scheduled');
  });
});
