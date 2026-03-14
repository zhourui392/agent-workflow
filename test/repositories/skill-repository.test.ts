/**
 * SqliteSkillRepository 集成测试
 *
 * 使用内存 SQLite 数据库验证 Skill 仓库的全部 CRUD 操作、
 * JSON 字段（allowedTools）序列化/反序列化、以及域对象实例化。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers/testDatabase';
import { SqliteSkillRepository } from '../../src/main/configuration/infrastructure/SqliteSkillRepository';
import { Skill } from '../../src/main/configuration/domain/model';
import type { CreateSkillInput } from '../../src/main/configuration/domain/model';

describe('SqliteSkillRepository', () => {
  let db: Database.Database;
  let repo: SqliteSkillRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new SqliteSkillRepository(db);
  });

  function buildInput(overrides: Partial<CreateSkillInput> = {}): CreateSkillInput {
    return {
      name: 'test-skill',
      description: 'A test skill',
      content: 'You are a helpful coding assistant.',
      allowedTools: ['Read', 'Write', 'Bash'],
      enabled: true,
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
      repo.create(buildInput({ name: 'skill-a' }));
      repo.create(buildInput({ name: 'skill-b' }));

      const all = repo.findAll();
      expect(all).toHaveLength(2);
      expect(all[0].name).toBe('skill-b');
      expect(all[1].name).toBe('skill-a');
      expect(all[0]).toBeInstanceOf(Skill);
    });
  });

  // ===========================================================================
  // findById
  // ===========================================================================
  describe('findById', () => {
    it('返回 Skill 实例', () => {
      const created = repo.create(buildInput());
      const found = repo.findById(created.id);

      expect(found).not.toBeNull();
      expect(found).toBeInstanceOf(Skill);
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
      const s1 = repo.create(buildInput({ name: 'skill-1' }));
      const s2 = repo.create(buildInput({ name: 'skill-2' }));
      repo.create(buildInput({ name: 'skill-3' }));

      const result = repo.findByIds([s1.id, s2.id]);
      expect(result).toHaveLength(2);
      const names = result.map(r => r.name).sort();
      expect(names).toEqual(['skill-1', 'skill-2']);
    });

    it('空数组返回空结果', () => {
      expect(repo.findByIds([])).toEqual([]);
    });

    it('不存在的 ID 被忽略', () => {
      const s1 = repo.create(buildInput({ name: 'skill-1' }));
      const result = repo.findByIds([s1.id, 'non-existent']);
      expect(result).toHaveLength(1);
    });
  });

  // ===========================================================================
  // findEnabled
  // ===========================================================================
  describe('findEnabled', () => {
    it('仅返回 enabled=true 的记录', () => {
      repo.create(buildInput({ name: 'enabled-skill', enabled: true }));
      repo.create(buildInput({ name: 'disabled-skill', enabled: false }));

      const result = repo.findEnabled();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('enabled-skill');
      expect(result[0].enabled).toBe(true);
    });
  });

  // ===========================================================================
  // findByName
  // ===========================================================================
  describe('findByName', () => {
    it('按名称精确匹配', () => {
      repo.create(buildInput({ name: 'unique-skill' }));

      const found = repo.findByName('unique-skill');
      expect(found).not.toBeNull();
      expect(found).toBeInstanceOf(Skill);
      expect(found!.name).toBe('unique-skill');
    });

    it('名称不匹配返回 null', () => {
      expect(repo.findByName('does-not-exist')).toBeNull();
    });
  });

  // ===========================================================================
  // create
  // ===========================================================================
  describe('create', () => {
    it('生成 UUID 并持久化所有字段（含 allowedTools）', () => {
      const created = repo.create(buildInput({
        name: 'full-skill',
        description: 'Complete skill definition',
        content: 'You must follow strict coding standards.',
        allowedTools: ['Read', 'Write', 'Bash', 'Grep', 'Glob'],
        enabled: true
      }));

      expect(created).toBeInstanceOf(Skill);
      expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(created.name).toBe('full-skill');
      expect(created.description).toBe('Complete skill definition');
      expect(created.content).toBe('You must follow strict coding standards.');
      expect(created.allowedTools).toEqual(['Read', 'Write', 'Bash', 'Grep', 'Glob']);
      expect(created.enabled).toBe(true);
      expect(created.createdAt).toBeDefined();
      expect(created.updatedAt).toBeDefined();
    });

    it('可选字段为空时正确处理', () => {
      const created = repo.create({
        name: 'minimal',
        content: 'Minimal skill'
      });

      expect(created.description).toBeUndefined();
      expect(created.allowedTools).toBeUndefined();
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
      expect(updated).toBeInstanceOf(Skill);
      expect(updated!.name).toBe('renamed');
      expect(updated!.description).toBe('old desc'); // 未修改
      expect(updated!.content).toBe(created.content); // 未修改
    });

    it('不存在的 ID 返回 null', () => {
      expect(repo.update('non-existent', { name: 'x' })).toBeNull();
    });

    it('更新 allowedTools（JSON 字段序列化/反序列化）', () => {
      const created = repo.create(buildInput({ allowedTools: ['Read'] }));
      const updated = repo.update(created.id, { allowedTools: ['Read', 'Write', 'Edit'] });
      expect(updated!.allowedTools).toEqual(['Read', 'Write', 'Edit']);
    });

    it('更新 content', () => {
      const created = repo.create(buildInput());
      const updated = repo.update(created.id, { content: 'Updated skill content' });
      expect(updated!.content).toBe('Updated skill content');
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
    it('禁用已启用的 Skill', () => {
      const created = repo.create(buildInput({ enabled: true }));
      const result = repo.setEnabled(created.id, false);

      expect(result).not.toBeNull();
      expect(result).toBeInstanceOf(Skill);
      expect(result!.enabled).toBe(false);
    });

    it('启用已禁用的 Skill', () => {
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
