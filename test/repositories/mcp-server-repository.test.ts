/**
 * SqliteMcpServerRepository 集成测试
 *
 * 使用内存 SQLite 数据库验证 MCP 服务器仓库的全部 CRUD 操作、
 * JSON 字段（args、env）序列化/反序列化、以及域对象实例化。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers/testDatabase';
import { SqliteMcpServerRepository } from '../../src/main/configuration/infrastructure/SqliteMcpServerRepository';
import { McpServer } from '../../src/main/configuration/domain/model';
import type { CreateMcpServerInput } from '../../src/main/configuration/domain/model';

describe('SqliteMcpServerRepository', () => {
  let db: Database.Database;
  let repo: SqliteMcpServerRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new SqliteMcpServerRepository(db);
  });

  function buildInput(overrides: Partial<CreateMcpServerInput> = {}): CreateMcpServerInput {
    return {
      name: 'test-server',
      command: 'npx',
      args: ['@anthropic/mcp-server'],
      env: { API_KEY: 'sk-test' },
      enabled: true,
      description: 'A test MCP server',
      ...overrides
    };
  }

  // ===========================================================================
  // findAll
  // ===========================================================================
  describe('findAll', () => {
    it('空数据库返回空数组', () => {
      expect(repo.findAll()).toEqual([]);
    });

    it('返回所有记录，按 created_at DESC 排序', () => {
      repo.create(buildInput({ name: 'server-a' }));
      repo.create(buildInput({ name: 'server-b' }));

      const all = repo.findAll();
      expect(all).toHaveLength(2);
      expect(all[0].name).toBe('server-b');
      expect(all[1].name).toBe('server-a');
      expect(all[0]).toBeInstanceOf(McpServer);
    });
  });

  // ===========================================================================
  // findById
  // ===========================================================================
  describe('findById', () => {
    it('返回 McpServer 实例', () => {
      const created = repo.create(buildInput());
      const found = repo.findById(created.id);

      expect(found).not.toBeNull();
      expect(found).toBeInstanceOf(McpServer);
      expect(found!.id).toBe(created.id);
    });

    it('不存在的 ID 返回 null', () => {
      expect(repo.findById('non-existent')).toBeNull();
    });
  });

  // ===========================================================================
  // findByIds
  // ===========================================================================
  describe('findByIds', () => {
    it('返回匹配的多条记录', () => {
      const s1 = repo.create(buildInput({ name: 'srv-1' }));
      const s2 = repo.create(buildInput({ name: 'srv-2' }));
      repo.create(buildInput({ name: 'srv-3' }));

      const result = repo.findByIds([s1.id, s2.id]);
      expect(result).toHaveLength(2);
      const names = result.map(r => r.name).sort();
      expect(names).toEqual(['srv-1', 'srv-2']);
    });

    it('空数组返回空结果', () => {
      expect(repo.findByIds([])).toEqual([]);
    });

    it('不存在的 ID 被忽略', () => {
      const s1 = repo.create(buildInput({ name: 'srv-1' }));
      const result = repo.findByIds([s1.id, 'non-existent']);
      expect(result).toHaveLength(1);
    });
  });

  // ===========================================================================
  // findEnabled
  // ===========================================================================
  describe('findEnabled', () => {
    it('仅返回 enabled=true 的记录', () => {
      repo.create(buildInput({ name: 'enabled-srv', enabled: true }));
      repo.create(buildInput({ name: 'disabled-srv', enabled: false }));

      const result = repo.findEnabled();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('enabled-srv');
      expect(result[0].enabled).toBe(true);
    });
  });

  // ===========================================================================
  // findByName
  // ===========================================================================
  describe('findByName', () => {
    it('按名称精确匹配', () => {
      repo.create(buildInput({ name: 'unique-server' }));

      const found = repo.findByName('unique-server');
      expect(found).not.toBeNull();
      expect(found).toBeInstanceOf(McpServer);
      expect(found!.name).toBe('unique-server');
    });

    it('名称不匹配返回 null', () => {
      expect(repo.findByName('does-not-exist')).toBeNull();
    });
  });

  // ===========================================================================
  // create
  // ===========================================================================
  describe('create', () => {
    it('生成 UUID 并持久化所有字段', () => {
      const created = repo.create(buildInput({
        name: 'full-server',
        description: 'Full test server',
        command: 'node',
        args: ['server.js', '--port', '3000'],
        env: { NODE_ENV: 'test', DEBUG: 'true' },
        enabled: true
      }));

      expect(created).toBeInstanceOf(McpServer);
      expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(created.name).toBe('full-server');
      expect(created.description).toBe('Full test server');
      expect(created.command).toBe('node');
      expect(created.args).toEqual(['server.js', '--port', '3000']);
      expect(created.env).toEqual({ NODE_ENV: 'test', DEBUG: 'true' });
      expect(created.enabled).toBe(true);
      expect(created.createdAt).toBeDefined();
      expect(created.updatedAt).toBeDefined();
    });

    it('可选字段为空时正确处理', () => {
      const created = repo.create({
        name: 'minimal',
        command: 'echo'
      });

      expect(created.description).toBeUndefined();
      expect(created.args).toBeUndefined();
      expect(created.env).toBeUndefined();
      expect(created.enabled).toBe(false); // enabled 未指定时为 falsy → false
    });
  });

  // ===========================================================================
  // update
  // ===========================================================================
  describe('update', () => {
    it('部分更新仅修改指定字段', () => {
      const created = repo.create(buildInput({ name: 'original', description: 'old desc' }));

      const updated = repo.update(created.id, { name: 'renamed' });

      expect(updated).not.toBeNull();
      expect(updated).toBeInstanceOf(McpServer);
      expect(updated!.name).toBe('renamed');
      expect(updated!.description).toBe('old desc'); // 未修改
      expect(updated!.command).toBe('npx'); // 未修改
    });

    it('不存在的 ID 返回 null', () => {
      expect(repo.update('non-existent', { name: 'x' })).toBeNull();
    });

    it('JSON 字段 args 正确序列化/反序列化', () => {
      const created = repo.create(buildInput());
      const newArgs = ['--verbose', '--config', 'prod.json'];

      const updated = repo.update(created.id, { args: newArgs });
      expect(updated!.args).toEqual(newArgs);
    });

    it('JSON 字段 env 正确序列化/反序列化', () => {
      const created = repo.create(buildInput());
      const newEnv = { DATABASE_URL: 'postgres://localhost', REDIS_URL: 'redis://localhost' };

      const updated = repo.update(created.id, { env: newEnv });
      expect(updated!.env).toEqual(newEnv);
    });

    it('更新 command', () => {
      const created = repo.create(buildInput());
      const updated = repo.update(created.id, { command: 'node' });
      expect(updated!.command).toBe('node');
    });

    it('更新 enabled', () => {
      const created = repo.create(buildInput({ enabled: true }));
      const updated = repo.update(created.id, { enabled: false });
      expect(updated!.enabled).toBe(false);
    });

    it('updatedAt 发生变化', () => {
      const created = repo.create(buildInput());
      const updated = repo.update(created.id, { name: 'changed' });
      expect(updated!.updatedAt).not.toBe(created.updatedAt);
    });
  });

  // ===========================================================================
  // setEnabled
  // ===========================================================================
  describe('setEnabled', () => {
    it('禁用已启用的服务器', () => {
      const created = repo.create(buildInput({ enabled: true }));
      const result = repo.setEnabled(created.id, false);

      expect(result).not.toBeNull();
      expect(result).toBeInstanceOf(McpServer);
      expect(result!.enabled).toBe(false);
    });

    it('启用已禁用的服务器', () => {
      const created = repo.create(buildInput({ enabled: false }));
      const result = repo.setEnabled(created.id, true);
      expect(result!.enabled).toBe(true);
    });

    it('不存在的 ID 返回 null', () => {
      expect(repo.setEnabled('non-existent', true)).toBeNull();
    });

    it('updatedAt 发生变化', () => {
      const created = repo.create(buildInput());
      const result = repo.setEnabled(created.id, false);
      expect(result!.updatedAt).not.toBe(created.updatedAt);
    });
  });

  // ===========================================================================
  // remove
  // ===========================================================================
  describe('remove', () => {
    it('删除已有记录', () => {
      const created = repo.create(buildInput());
      expect(repo.remove(created.id)).toBe(true);
      expect(repo.findById(created.id)).toBeNull();
    });

    it('删除不存在的记录返回 false', () => {
      expect(repo.remove('non-existent')).toBe(false);
    });
  });
});
