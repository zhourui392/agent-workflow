/**
 * WorkflowApplicationService 单元测试
 *
 * 验证应用服务层的编排逻辑：仓储委托、调度器同步、流水线执行。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowApplicationService } from '../../src/main/workflow/application/WorkflowApplicationService';
import type { SchedulerPort, PipelinePort } from '../../src/main/workflow/application/WorkflowApplicationService';
import type { WorkflowRepository } from '../../src/main/workflow/domain/repository/WorkflowRepository';
import { createMockWorkflowRepository, createTestWorkflow } from '../fixtures';

// electron-log 静默
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } }));

function createMockScheduler(): SchedulerPort {
  return {
    register: vi.fn(),
    unregister: vi.fn(),
  };
}

function createMockPipeline(): PipelinePort {
  return {
    execute: vi.fn(async () => 'exec-001'),
  };
}

describe('WorkflowApplicationService', () => {
  let repo: ReturnType<typeof createMockWorkflowRepository>;
  let scheduler: ReturnType<typeof createMockScheduler>;
  let pipeline: ReturnType<typeof createMockPipeline>;
  let service: WorkflowApplicationService;

  beforeEach(() => {
    repo = createMockWorkflowRepository();
    scheduler = createMockScheduler();
    pipeline = createMockPipeline();
    service = new WorkflowApplicationService(repo, scheduler, pipeline);
  });

  // ── list ──────────────────────────────────────────────────────────
  describe('list', () => {
    it('delegates to repo.findAll', () => {
      const workflows = [createTestWorkflow()];
      (repo.findAll as ReturnType<typeof vi.fn>).mockReturnValue(workflows);

      const result = service.list();

      expect(repo.findAll).toHaveBeenCalledOnce();
      expect(result).toBe(workflows);
    });
  });

  // ── get ───────────────────────────────────────────────────────────
  describe('get', () => {
    it('delegates to repo.findById', () => {
      const wf = createTestWorkflow();
      (repo.findById as ReturnType<typeof vi.fn>).mockReturnValue(wf);

      const result = service.get('wf-001');

      expect(repo.findById).toHaveBeenCalledWith('wf-001');
      expect(result).toBe(wf);
    });
  });

  // ── create ────────────────────────────────────────────────────────
  describe('create', () => {
    it('calls repo.create and registers scheduler when workflow is schedulable', () => {
      const schedulableWf = createTestWorkflow({ schedule: '0 9 * * *', enabled: true });
      (repo.create as ReturnType<typeof vi.fn>).mockReturnValue(schedulableWf);

      const input = { name: 'New WF', steps: [{ name: 'S1', prompt: 'do it' }], onFailure: 'stop' as const };
      const result = service.create(input);

      expect(repo.create).toHaveBeenCalledWith(input);
      expect(result).toBe(schedulableWf);
      expect(scheduler.register).toHaveBeenCalledWith(
        schedulableWf.id,
        '0 9 * * *',
        expect.any(Function)
      );
    });

    it('does NOT register scheduler when workflow is not schedulable', () => {
      const noScheduleWf = createTestWorkflow({ enabled: true }); // no schedule
      (repo.create as ReturnType<typeof vi.fn>).mockReturnValue(noScheduleWf);

      service.create({ name: 'No Sched', steps: [{ name: 'S1', prompt: 'do' }], onFailure: 'stop' });

      expect(scheduler.register).not.toHaveBeenCalled();
      expect(scheduler.unregister).toHaveBeenCalledWith(noScheduleWf.id);
    });
  });

  // ── update ────────────────────────────────────────────────────────
  describe('update', () => {
    it('calls repo.update and syncs scheduler', () => {
      const updatedWf = createTestWorkflow({ schedule: '*/5 * * * *', enabled: true });
      (repo.update as ReturnType<typeof vi.fn>).mockReturnValue(updatedWf);

      const result = service.update('wf-001', { name: 'Updated' });

      expect(repo.update).toHaveBeenCalledWith('wf-001', { name: 'Updated' });
      expect(result).toBe(updatedWf);
      expect(scheduler.register).toHaveBeenCalledWith(
        updatedWf.id,
        '*/5 * * * *',
        expect.any(Function)
      );
    });

    it('returns null for non-existent workflow', () => {
      (repo.update as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const result = service.update('non-existent', { name: 'X' });

      expect(result).toBeNull();
      expect(scheduler.register).not.toHaveBeenCalled();
      expect(scheduler.unregister).not.toHaveBeenCalled();
    });
  });

  // ── remove ────────────────────────────────────────────────────────
  describe('remove', () => {
    it('unregisters scheduler and calls repo.remove', () => {
      (repo.remove as ReturnType<typeof vi.fn>).mockReturnValue(true);

      const result = service.remove('wf-001');

      expect(scheduler.unregister).toHaveBeenCalledWith('wf-001');
      expect(repo.remove).toHaveBeenCalledWith('wf-001');
      expect(result).toBe(true);
    });
  });

  // ── toggle ────────────────────────────────────────────────────────
  describe('toggle', () => {
    it('registers scheduler when toggled to enabled with schedule', () => {
      const enabledWf = createTestWorkflow({ enabled: true, schedule: '0 8 * * 1-5' });
      (repo.toggle as ReturnType<typeof vi.fn>).mockReturnValue(enabledWf);

      const result = service.toggle('wf-001');

      expect(repo.toggle).toHaveBeenCalledWith('wf-001');
      expect(result).toBe(enabledWf);
      expect(scheduler.register).toHaveBeenCalledWith(
        enabledWf.id,
        '0 8 * * 1-5',
        expect.any(Function)
      );
    });

    it('unregisters scheduler when toggled to disabled', () => {
      const disabledWf = createTestWorkflow({ enabled: false, schedule: '0 8 * * 1-5' });
      (repo.toggle as ReturnType<typeof vi.fn>).mockReturnValue(disabledWf);

      const result = service.toggle('wf-001');

      expect(result).toBe(disabledWf);
      expect(scheduler.unregister).toHaveBeenCalledWith('wf-001');
      expect(scheduler.register).not.toHaveBeenCalled();
    });

    it('returns null for non-existent workflow', () => {
      (repo.toggle as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const result = service.toggle('non-existent');

      expect(result).toBeNull();
    });
  });

  // ── clone ──────────────────────────────────────────────────────────
  describe('clone', () => {
    it('returns cloned workflow with "(Copy)" suffix and enabled=false', () => {
      const source = createTestWorkflow({
        name: 'My Flow',
        schedule: '0 9 * * *',
        enabled: true,
        steps: [{ name: 'S1', prompt: 'do it' }],
        rules: 'some rules',
        skills: { skill1: 'content1' },
        limits: { maxTurns: 10 },
        onFailure: 'retry'
      });
      (repo.findById as ReturnType<typeof vi.fn>).mockReturnValue(source);

      const clonedWf = createTestWorkflow({ name: 'My Flow (Copy)', enabled: false });
      (repo.create as ReturnType<typeof vi.fn>).mockReturnValue(clonedWf);

      const result = service.clone('wf-001');

      expect(repo.findById).toHaveBeenCalledWith('wf-001');
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'My Flow (Copy)',
          enabled: false,
          steps: [{ name: 'S1', prompt: 'do it' }],
          rules: 'some rules',
          skills: { skill1: 'content1' },
          limits: { maxTurns: 10 },
          onFailure: 'retry'
        })
      );
      expect(result).toBe(clonedWf);
    });

    it('returns null for non-existent workflow', () => {
      (repo.findById as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const result = service.clone('non-existent');

      expect(result).toBeNull();
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('preserves all fields including inputs, schedule, workingDirectory, retryConfig', () => {
      const source = createTestWorkflow({
        name: 'Full',
        schedule: '*/5 * * * *',
        enabled: true,
        inputs: [{ name: 'param1', type: 'string' as any, required: true }],
        steps: [{ name: 'S1', prompt: 'p' }],
        workingDirectory: '/tmp/work',
        retryConfig: { maxAttempts: 5, delayMs: 2000 },
        onFailure: 'stop'
      });
      (repo.findById as ReturnType<typeof vi.fn>).mockReturnValue(source);
      (repo.create as ReturnType<typeof vi.fn>).mockReturnValue(createTestWorkflow());

      service.clone('wf-001');

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          schedule: '*/5 * * * *',
          inputs: [{ name: 'param1', type: 'string', required: true }],
          workingDirectory: '/tmp/work',
          retryConfig: { maxAttempts: 5, delayMs: 2000 }
        })
      );
    });
  });

  // ── run ───────────────────────────────────────────────────────────
  describe('run', () => {
    it('calls pipeline.execute with workflow and returns executionId', async () => {
      const wf = createTestWorkflow();
      (repo.findById as ReturnType<typeof vi.fn>).mockReturnValue(wf);

      const result = await service.run('wf-001', { key: 'value' });

      expect(repo.findById).toHaveBeenCalledWith('wf-001');
      expect(pipeline.execute).toHaveBeenCalledWith(wf, { key: 'value' }, 'manual');
      expect(result).toBe('exec-001');
    });

    it('returns null for non-existent workflow', async () => {
      (repo.findById as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const result = await service.run('non-existent');

      expect(result).toBeNull();
      expect(pipeline.execute).not.toHaveBeenCalled();
    });
  });
});
