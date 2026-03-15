/**
 * SqliteWorkflowRepository 集成测试
 *
 * 使用内存 SQLite 数据库验证工作流仓库的全部 CRUD 操作、
 * JSON 字段序列化/反序列化、以及域对象实例化。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers/testDatabase';
import { SqliteWorkflowRepository } from '../../src/main/workflow/infrastructure/SqliteWorkflowRepository';
import { Workflow } from '../../src/main/workflow/domain/model';
import type { CreateWorkflowRequest } from '../../src/main/workflow/domain/model';

describe('SqliteWorkflowRepository', () => {
  let db: Database.Database;
  let repo: SqliteWorkflowRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new SqliteWorkflowRepository(db);
  });

  // ---------------------------------------------------------------------------
  // Helper: 创建完整工作流的请求数据
  // ---------------------------------------------------------------------------
  function buildCreateRequest(overrides: Partial<CreateWorkflowRequest> = {}): CreateWorkflowRequest {
    return {
      name: 'Integration Test Workflow',
      steps: [
        { name: 'Step 1', prompt: 'Do something' },
        { name: 'Step 2', prompt: 'Do something else with {{steps.Step 1.output}}' }
      ],
      ...overrides
    };
  }

  // ===========================================================================
  // findAll
  // ===========================================================================
  describe('findAll', () => {
    it('空数据库返回空数组', () => {
      const result = repo.findAll();
      expect(result).toEqual([]);
    });

    it('返回多条记录，按 created_at DESC 排序', () => {
      const wf1 = repo.create(buildCreateRequest({ name: 'Workflow A' }));
      const wf2 = repo.create(buildCreateRequest({ name: 'Workflow B' }));

      const result = repo.findAll();
      expect(result).toHaveLength(2);
      // 后创建的排在前面
      expect(result[0].name).toBe('Workflow B');
      expect(result[1].name).toBe('Workflow A');
      expect(result[0]).toBeInstanceOf(Workflow);
      expect(result[1]).toBeInstanceOf(Workflow);
    });
  });

  // ===========================================================================
  // findById
  // ===========================================================================
  describe('findById', () => {
    it('找到已有记录并返回 Workflow 实例', () => {
      const created = repo.create(buildCreateRequest());
      const found = repo.findById(created.id);

      expect(found).not.toBeNull();
      expect(found).toBeInstanceOf(Workflow);
      expect(found!.id).toBe(created.id);
      expect(found!.name).toBe('Integration Test Workflow');
    });

    it('ID 不存在时返回 null', () => {
      const found = repo.findById('non-existent-id');
      expect(found).toBeNull();
    });
  });

  // ===========================================================================
  // findEnabledWithSchedule
  // ===========================================================================
  describe('findEnabledWithSchedule', () => {
    it('仅返回 enabled=true 且 schedule 非空的工作流', () => {
      // 有 schedule 且 enabled
      repo.create(buildCreateRequest({ name: 'Scheduled Enabled', enabled: true, schedule: '*/5 * * * *' }));
      // 有 schedule 但 disabled
      repo.create(buildCreateRequest({ name: 'Scheduled Disabled', enabled: false, schedule: '0 9 * * *' }));
      // 无 schedule 但 enabled
      repo.create(buildCreateRequest({ name: 'No Schedule', enabled: true }));
      // 空字符串 schedule
      repo.create(buildCreateRequest({ name: 'Empty Schedule', enabled: true, schedule: '' }));

      const result = repo.findEnabledWithSchedule();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Scheduled Enabled');
      expect(result[0].schedule).toBe('*/5 * * * *');
    });
  });

  // ===========================================================================
  // create
  // ===========================================================================
  describe('create', () => {
    it('生成 UUID 并持久化所有字段', () => {
      const request: CreateWorkflowRequest = {
        name: 'Full Workflow',
        enabled: true,
        schedule: '0 9 * * 1-5',
        inputs: [
          { name: 'env', type: 'string', required: true, default: 'production' }
        ],
        steps: [
          {
            name: 'Build',
            prompt: 'Run build for {{inputs.env}}',
            model: 'claude-sonnet-4-20250514',
            maxTurns: 5,
            skillIds: ['skill-1'],
            onFailure: 'retry',
            retryConfig: { maxAttempts: 3, delayMs: 1000 },
            validation: { prompt: 'Check build output' }
          }
        ],
        rules: 'Always use TypeScript',
        skills: { 'code-review': '/path/to/skill' },
        limits: { maxTurns: 10, timeoutMs: 60000 },
        output: {
          file: { path: '/tmp/output.md', format: 'markdown' },
          webhook: { url: 'https://example.com/hook', method: 'POST', headers: { 'X-Key': 'val' }, timeoutMs: 5000 }
        },
        workingDirectory: '/home/user/project',
        onFailure: 'skip'
      };

      const created = repo.create(request);

      expect(created).toBeInstanceOf(Workflow);
      // UUID 格式
      expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(created.name).toBe('Full Workflow');
      expect(created.enabled).toBe(true);
      expect(created.schedule).toBe('0 9 * * 1-5');
      expect(created.inputs).toEqual([{ name: 'env', type: 'string', required: true, default: 'production' }]);
      expect(created.steps).toHaveLength(1);
      expect(created.steps[0].name).toBe('Build');
      expect(created.steps[0].model).toBe('claude-sonnet-4-20250514');
      expect(created.steps[0].retryConfig).toEqual({ maxAttempts: 3, delayMs: 1000 });
      expect(created.rules).toBe('Always use TypeScript');
      expect(created.skills).toEqual({ 'code-review': '/path/to/skill' });
      expect(created.limits).toEqual({ maxTurns: 10, timeoutMs: 60000 });
      expect(created.output).toEqual({
        file: { path: '/tmp/output.md', format: 'markdown' },
        webhook: { url: 'https://example.com/hook', method: 'POST', headers: { 'X-Key': 'val' }, timeoutMs: 5000 }
      });
      expect(created.workingDirectory).toBe('/home/user/project');
      expect(created.onFailure).toBe('skip');
      expect(created.createdAt).toBeDefined();
      expect(created.updatedAt).toBeDefined();
    });

    it('未指定 enabled 时默认为 true', () => {
      const created = repo.create(buildCreateRequest());
      expect(created.enabled).toBe(true);
    });

    it('未指定 onFailure 时默认为 stop', () => {
      const created = repo.create(buildCreateRequest());
      expect(created.onFailure).toBe('stop');
    });
  });

  // ===========================================================================
  // update
  // ===========================================================================
  describe('update', () => {
    it('部分更新仅修改指定字段', () => {
      const created = repo.create(buildCreateRequest({ name: 'Original', rules: 'Old rules' }));

      const updated = repo.update(created.id, { name: 'Renamed' });

      expect(updated).not.toBeNull();
      expect(updated).toBeInstanceOf(Workflow);
      expect(updated!.name).toBe('Renamed');
      // 未修改的字段保持不变
      expect(updated!.rules).toBe('Old rules');
      expect(updated!.steps).toEqual(created.steps);
      // updatedAt 应该更新
      expect(updated!.updatedAt).not.toBe(created.updatedAt);
    });

    it('不存在的 ID 返回 null', () => {
      const result = repo.update('non-existent', { name: 'X' });
      expect(result).toBeNull();
    });

    it('JSON 字段正确序列化/反序列化', () => {
      const created = repo.create(buildCreateRequest());

      const newSteps = [
        { name: 'New Step', prompt: 'New prompt', model: 'opus' }
      ];
      const newSkills = { 'my-skill': '/skill/path' };
      const newLimits = { maxTurns: 20 };
      const newOutput = { file: { path: '/out.txt', format: 'text' as const } };

      const updated = repo.update(created.id, {
        steps: newSteps,
        skills: newSkills,
        limits: newLimits,
        output: newOutput
      });

      expect(updated!.steps).toEqual(newSteps);
      expect(updated!.skills).toEqual(newSkills);
      expect(updated!.limits).toEqual(newLimits);
      expect(updated!.output).toEqual(newOutput);
    });

    it('可以更新 onFailure 策略', () => {
      const created = repo.create(buildCreateRequest({ onFailure: 'stop' }));
      const updated = repo.update(created.id, { onFailure: 'retry' });
      expect(updated!.onFailure).toBe('retry');
    });

    it('可以更新 enabled 状态', () => {
      const created = repo.create(buildCreateRequest({ enabled: true }));
      const updated = repo.update(created.id, { enabled: false });
      expect(updated!.enabled).toBe(false);
    });

    it('可以更新 workingDirectory', () => {
      const created = repo.create(buildCreateRequest());
      const updated = repo.update(created.id, { workingDirectory: '/new/path' });
      expect(updated!.workingDirectory).toBe('/new/path');
    });

    it('可以更新 inputs', () => {
      const created = repo.create(buildCreateRequest());
      const newInputs = [{ name: 'target', type: 'string', required: false }];
      const updated = repo.update(created.id, { inputs: newInputs });
      expect(updated!.inputs).toEqual(newInputs);
    });
  });

  // ===========================================================================
  // toggle
  // ===========================================================================
  describe('toggle', () => {
    it('翻转 enabled 状态 true → false', () => {
      const created = repo.create(buildCreateRequest({ enabled: true }));
      const toggled = repo.toggle(created.id);

      expect(toggled).not.toBeNull();
      expect(toggled).toBeInstanceOf(Workflow);
      expect(toggled!.enabled).toBe(false);
    });

    it('翻转 enabled 状态 false → true', () => {
      const created = repo.create(buildCreateRequest({ enabled: false }));
      const toggled = repo.toggle(created.id);

      expect(toggled!.enabled).toBe(true);
    });

    it('不存在的 ID 返回 null', () => {
      const result = repo.toggle('non-existent');
      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // remove
  // ===========================================================================
  describe('remove', () => {
    it('删除已有记录后 findById 返回 null', () => {
      const created = repo.create(buildCreateRequest());
      const deleted = repo.remove(created.id);

      expect(deleted).toBe(true);
      expect(repo.findById(created.id)).toBeNull();
    });

    it('删除不存在的记录返回 false', () => {
      const result = repo.remove('non-existent');
      expect(result).toBe(false);
    });
  });
});
