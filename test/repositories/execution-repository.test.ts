/**
 * SqliteExecutionRepository 集成测试
 *
 * 使用内存 SQLite 数据库验证执行记录仓库的全部操作，
 * 包括外键关联、状态更新、token 累加、步骤执行管理和级联删除。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers/testDatabase';
import { SqliteExecutionRepository } from '../../src/main/execution/infrastructure/SqliteExecutionRepository';
import { Execution, StepExecution } from '../../src/main/execution/domain/model';

describe('SqliteExecutionRepository', () => {
  let db: Database.Database;
  let repo: SqliteExecutionRepository;
  let workflowId: string;

  /**
   * 每个测试前：创建内存数据库、插入一条 workflow 记录（满足外键约束）
   */
  beforeEach(() => {
    db = createTestDatabase();
    repo = new SqliteExecutionRepository(db);

    // 直接插入 workflow 以满足 executions 表的外键约束
    workflowId = 'wf-test-001';
    db.prepare(`
      INSERT INTO workflows (id, name, enabled, steps, on_failure, created_at, updated_at)
      VALUES (?, ?, 1, ?, 'stop', datetime('now'), datetime('now'))
    `).run(
      workflowId,
      'Test Workflow',
      JSON.stringify([
        { name: 'Build', prompt: 'Run build' },
        { name: 'Test', prompt: 'Run tests' },
        { name: 'Deploy', prompt: 'Deploy to prod' }
      ])
    );
  });

  // ---------------------------------------------------------------------------
  // Helper
  // ---------------------------------------------------------------------------
  function insertSecondWorkflow(): string {
    const id = 'wf-test-002';
    db.prepare(`
      INSERT INTO workflows (id, name, enabled, steps, on_failure, created_at, updated_at)
      VALUES (?, ?, 1, ?, 'stop', datetime('now'), datetime('now'))
    `).run(id, 'Other Workflow', JSON.stringify([{ name: 'Only Step', prompt: 'Do it' }]));
    return id;
  }

  // ===========================================================================
  // create
  // ===========================================================================
  describe('create', () => {
    it('创建执行记录，状态为 pending', () => {
      const exec = repo.create(workflowId, 'manual');

      expect(exec).toBeInstanceOf(Execution);
      expect(exec.id).toMatch(/^[0-9a-f]{8}-/);
      expect(exec.workflowId).toBe(workflowId);
      expect(exec.triggerType).toBe('manual');
      expect(exec.status).toBe('pending');
      expect(exec.currentStep).toBe(0);
      expect(exec.totalTokens).toBe(0);
    });

    it('支持 scheduled 触发类型', () => {
      const exec = repo.create(workflowId, 'scheduled');
      expect(exec.triggerType).toBe('scheduled');
    });

    it('join 后包含 workflowName 和 totalSteps', () => {
      const exec = repo.create(workflowId, 'manual');
      expect(exec.workflowName).toBe('Test Workflow');
      expect(exec.totalSteps).toBe(3);
    });
  });

  // ===========================================================================
  // findAll
  // ===========================================================================
  describe('findAll', () => {
    it('无参数返回所有记录，按 started_at DESC', () => {
      repo.create(workflowId, 'manual');
      repo.create(workflowId, 'scheduled');

      const all = repo.findAll();
      expect(all).toHaveLength(2);
      expect(all[0]).toBeInstanceOf(Execution);
      // 后创建的排前面
      expect(all[0].triggerType).toBe('scheduled');
    });

    it('按 workflowId 过滤', () => {
      const otherId = insertSecondWorkflow();
      repo.create(workflowId, 'manual');
      repo.create(otherId, 'manual');

      const filtered = repo.findAll({ workflowId });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].workflowId).toBe(workflowId);
    });

    it('按 status 过滤', () => {
      const e1 = repo.create(workflowId, 'manual');
      repo.create(workflowId, 'manual');
      repo.updateStatus(e1.id, 'running');

      const running = repo.findAll({ status: 'running' });
      expect(running).toHaveLength(1);
      expect(running[0].id).toBe(e1.id);
    });

    it('支持 limit 和 offset', () => {
      repo.create(workflowId, 'manual');
      repo.create(workflowId, 'manual');
      repo.create(workflowId, 'manual');

      const page = repo.findAll({ limit: 2, offset: 1 });
      expect(page).toHaveLength(2);
    });

    it('同时使用多个过滤条件', () => {
      const otherId = insertSecondWorkflow();
      const e1 = repo.create(workflowId, 'manual');
      repo.create(workflowId, 'manual');
      repo.create(otherId, 'manual');
      repo.updateStatus(e1.id, 'running');

      const result = repo.findAll({ workflowId, status: 'running' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(e1.id);
    });
  });

  // ===========================================================================
  // findById
  // ===========================================================================
  describe('findById', () => {
    it('返回 Execution 实例，包含 workflowName 和 totalSteps', () => {
      const created = repo.create(workflowId, 'manual');
      const found = repo.findById(created.id);

      expect(found).not.toBeNull();
      expect(found).toBeInstanceOf(Execution);
      expect(found!.workflowName).toBe('Test Workflow');
      expect(found!.totalSteps).toBe(3);
    });

    it('不存在的 ID 返回 null', () => {
      expect(repo.findById('non-existent')).toBeNull();
    });
  });

  // ===========================================================================
  // findByIdWithSteps
  // ===========================================================================
  describe('findByIdWithSteps', () => {
    it('包含步骤执行记录和步骤名称', () => {
      const exec = repo.create(workflowId, 'manual');
      repo.createStepExecution(exec.id, 0, 'Rendered prompt for Build');
      repo.createStepExecution(exec.id, 1, 'Rendered prompt for Test');

      const found = repo.findByIdWithSteps(exec.id);

      expect(found).not.toBeNull();
      expect(found).toBeInstanceOf(Execution);
      expect(found!.stepExecutions).toHaveLength(2);
      expect(found!.stepExecutions![0]).toBeInstanceOf(StepExecution);
      expect(found!.stepExecutions![0].stepName).toBe('Build');
      expect(found!.stepExecutions![0].stepIndex).toBe(0);
      expect(found!.stepExecutions![1].stepName).toBe('Test');
      expect(found!.stepExecutions![1].stepIndex).toBe(1);
    });

    it('步骤按 stepIndex 升序排列', () => {
      const exec = repo.create(workflowId, 'manual');
      // 故意乱序插入
      repo.createStepExecution(exec.id, 2, 'Deploy prompt');
      repo.createStepExecution(exec.id, 0, 'Build prompt');
      repo.createStepExecution(exec.id, 1, 'Test prompt');

      const found = repo.findByIdWithSteps(exec.id);
      expect(found!.stepExecutions![0].stepIndex).toBe(0);
      expect(found!.stepExecutions![1].stepIndex).toBe(1);
      expect(found!.stepExecutions![2].stepIndex).toBe(2);
    });

    it('无步骤执行时返回空 stepExecutions 数组', () => {
      const exec = repo.create(workflowId, 'manual');
      const found = repo.findByIdWithSteps(exec.id);
      expect(found!.stepExecutions).toEqual([]);
    });

    it('不存在的 ID 返回 null', () => {
      expect(repo.findByIdWithSteps('non-existent')).toBeNull();
    });
  });

  // ===========================================================================
  // updateStatus
  // ===========================================================================
  describe('updateStatus', () => {
    it('更新为 running 状态', () => {
      const exec = repo.create(workflowId, 'manual');
      repo.updateStatus(exec.id, 'running');

      const found = repo.findById(exec.id)!;
      expect(found.status).toBe('running');
      // running 不设置 finishedAt
      expect(found.finishedAt).toBeUndefined();
    });

    it('更新为 success 时设置 finishedAt', () => {
      const exec = repo.create(workflowId, 'manual');
      repo.updateStatus(exec.id, 'running');
      repo.updateStatus(exec.id, 'success');

      const found = repo.findById(exec.id)!;
      expect(found.status).toBe('success');
      expect(found.finishedAt).toBeDefined();
    });

    it('更新为 failed 时设置 errorMessage', () => {
      const exec = repo.create(workflowId, 'manual');
      repo.updateStatus(exec.id, 'running');
      repo.updateStatus(exec.id, 'failed', 'Build step timed out');

      const found = repo.findById(exec.id)!;
      expect(found.status).toBe('failed');
      expect(found.finishedAt).toBeDefined();
      expect(found.errorMessage).toBe('Build step timed out');
    });
  });

  // ===========================================================================
  // updateCurrentStep
  // ===========================================================================
  describe('updateCurrentStep', () => {
    it('更新当前步骤索引', () => {
      const exec = repo.create(workflowId, 'manual');
      repo.updateCurrentStep(exec.id, 2);

      const found = repo.findById(exec.id)!;
      expect(found.currentStep).toBe(2);
    });
  });

  // ===========================================================================
  // addTokens
  // ===========================================================================
  describe('addTokens', () => {
    it('累加 token 使用量', () => {
      const exec = repo.create(workflowId, 'manual');
      repo.addTokens(exec.id, 500);
      repo.addTokens(exec.id, 300);

      const found = repo.findById(exec.id)!;
      expect(found.totalTokens).toBe(800);
    });
  });

  // ===========================================================================
  // createStepExecution
  // ===========================================================================
  describe('createStepExecution', () => {
    it('创建步骤执行记录，状态为 running', () => {
      const exec = repo.create(workflowId, 'manual');
      const step = repo.createStepExecution(exec.id, 0, 'Rendered: Run build');

      expect(step).toBeInstanceOf(StepExecution);
      expect(step.id).toMatch(/^[0-9a-f]{8}-/);
      expect(step.executionId).toBe(exec.id);
      expect(step.stepIndex).toBe(0);
      expect(step.status).toBe('running');
      expect(step.promptRendered).toBe('Rendered: Run build');
      expect(step.tokensUsed).toBe(0);
    });
  });

  // ===========================================================================
  // updateStepExecution
  // ===========================================================================
  describe('updateStepExecution', () => {
    it('更新 status 和 outputText', () => {
      const exec = repo.create(workflowId, 'manual');
      const step = repo.createStepExecution(exec.id, 0, 'prompt');

      repo.updateStepExecution(step.id, {
        status: 'success',
        outputText: 'Build completed successfully'
      });

      const found = repo.findByIdWithSteps(exec.id)!;
      const updatedStep = found.stepExecutions![0];
      expect(updatedStep.status).toBe('success');
      expect(updatedStep.outputText).toBe('Build completed successfully');
    });

    it('更新 tokensUsed 和 modelUsed', () => {
      const exec = repo.create(workflowId, 'manual');
      const step = repo.createStepExecution(exec.id, 0, 'prompt');

      repo.updateStepExecution(step.id, {
        tokensUsed: 1500,
        modelUsed: 'claude-sonnet-4-20250514'
      });

      const found = repo.findByIdWithSteps(exec.id)!;
      const updatedStep = found.stepExecutions![0];
      expect(updatedStep.tokensUsed).toBe(1500);
      expect(updatedStep.modelUsed).toBe('claude-sonnet-4-20250514');
    });

    it('更新 errorMessage', () => {
      const exec = repo.create(workflowId, 'manual');
      const step = repo.createStepExecution(exec.id, 0, 'prompt');

      repo.updateStepExecution(step.id, {
        status: 'failed',
        errorMessage: 'Connection refused'
      });

      const found = repo.findByIdWithSteps(exec.id)!;
      expect(found.stepExecutions![0].errorMessage).toBe('Connection refused');
    });

    it('更新 validationStatus 和 validationOutput', () => {
      const exec = repo.create(workflowId, 'manual');
      const step = repo.createStepExecution(exec.id, 0, 'prompt');

      repo.updateStepExecution(step.id, {
        validationStatus: 'passed',
        validationOutput: 'All checks passed'
      });

      const found = repo.findByIdWithSteps(exec.id)!;
      expect(found.stepExecutions![0].validationStatus).toBe('passed');
      expect(found.stepExecutions![0].validationOutput).toBe('All checks passed');
    });

    it('更新 eventsJson 并正确反序列化', () => {
      const exec = repo.create(workflowId, 'manual');
      const step = repo.createStepExecution(exec.id, 0, 'prompt');

      const events = [
        { type: 'init', timestamp: '2026-03-14T00:00:00Z' },
        { type: 'text', content: 'Hello', timestamp: '2026-03-14T00:00:01Z' }
      ];

      repo.updateStepExecution(step.id, {
        eventsJson: JSON.stringify(events)
      });

      const found = repo.findByIdWithSteps(exec.id)!;
      expect(found.stepExecutions![0].events).toEqual(events);
    });

    it('空数据不做任何修改', () => {
      const exec = repo.create(workflowId, 'manual');
      const step = repo.createStepExecution(exec.id, 0, 'prompt');

      // 不应抛出异常
      repo.updateStepExecution(step.id, {});

      const found = repo.findByIdWithSteps(exec.id)!;
      expect(found.stepExecutions![0].status).toBe('running');
    });
  });

  // ===========================================================================
  // count
  // ===========================================================================
  describe('count', () => {
    it('统计全部执行记录', () => {
      repo.create(workflowId, 'manual');
      repo.create(workflowId, 'scheduled');

      expect(repo.count()).toBe(2);
    });

    it('按 workflowId 过滤计数', () => {
      const otherId = insertSecondWorkflow();
      repo.create(workflowId, 'manual');
      repo.create(workflowId, 'manual');
      repo.create(otherId, 'manual');

      expect(repo.count({ workflowId })).toBe(2);
    });

    it('按 status 过滤计数', () => {
      const e1 = repo.create(workflowId, 'manual');
      repo.create(workflowId, 'manual');
      repo.updateStatus(e1.id, 'running');

      expect(repo.count({ status: 'running' })).toBe(1);
      expect(repo.count({ status: 'pending' })).toBe(1);
    });

    it('空数据库返回 0', () => {
      expect(repo.count()).toBe(0);
    });
  });

  // ===========================================================================
  // deleteByWorkflowId
  // ===========================================================================
  describe('deleteByWorkflowId', () => {
    it('删除指定工作流的所有执行记录', () => {
      repo.create(workflowId, 'manual');
      repo.create(workflowId, 'scheduled');

      repo.deleteByWorkflowId(workflowId);

      expect(repo.count({ workflowId })).toBe(0);
    });

    it('级联删除关联的 step_executions', () => {
      const exec = repo.create(workflowId, 'manual');
      repo.createStepExecution(exec.id, 0, 'prompt 0');
      repo.createStepExecution(exec.id, 1, 'prompt 1');

      repo.deleteByWorkflowId(workflowId);

      // 验证 step_executions 也被删除（通过外键级联）
      const stepCount = (db.prepare('SELECT COUNT(*) AS cnt FROM step_executions').get() as { cnt: number }).cnt;
      expect(stepCount).toBe(0);
    });

    it('不影响其他工作流的执行记录', () => {
      const otherId = insertSecondWorkflow();
      repo.create(workflowId, 'manual');
      repo.create(otherId, 'manual');

      repo.deleteByWorkflowId(workflowId);

      expect(repo.count({ workflowId: otherId })).toBe(1);
    });
  });
});
