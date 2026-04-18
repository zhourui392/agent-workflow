/**
 * SqliteSkillRepository 集成测试
 *
 * 使用内存 SQLite + 临时 SkillFileStore 目录验证 Skill 仓库的全部 CRUD 操作：
 * - DB 行与磁盘目录的一致性（create 同时写两者，remove 同时删两者）
 * - SKILL.md frontmatter 解析出的 description/allowedTools 注入实体
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers/testDatabase';
import { SqliteSkillRepository } from '../../src/main/configuration/infrastructure/SqliteSkillRepository';
import { SkillFileStore } from '../../src/main/configuration/infrastructure/SkillFileStore';
import { Skill } from '../../src/main/configuration/domain/model';
import type { CreateSkillInput } from '../../src/main/configuration/domain/model';

describe('SqliteSkillRepository', () => {
  let db: Database.Database;
  let tmpRoot: string;
  let baseDir: string;
  let store: SkillFileStore;
  let repo: SqliteSkillRepository;

  beforeEach(() => {
    db = createTestDatabase();
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skillrepo-'));
    baseDir = path.join(tmpRoot, 'skills');
    store = new SkillFileStore(baseDir);
    repo = new SqliteSkillRepository(db, store);
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  function makeSourceDir(name: string, opts: { description?: string; allowedTools?: string[]; extra?: Record<string, string> } = {}): string {
    const src = path.join(tmpRoot, 'src', name);
    fs.mkdirSync(src, { recursive: true });

    const frontmatter: string[] = [`name: ${name}`];
    if (opts.description) frontmatter.push(`description: ${opts.description}`);
    if (opts.allowedTools) frontmatter.push(`allowed-tools: ${opts.allowedTools.join(', ')}`);
    const md = `---\n${frontmatter.join('\n')}\n---\n\nbody`;
    fs.writeFileSync(path.join(src, 'SKILL.md'), md, 'utf-8');

    if (opts.extra) {
      for (const [rel, content] of Object.entries(opts.extra)) {
        const abs = path.join(src, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content, 'utf-8');
      }
    }
    return src;
  }

  function buildInput(name = 'test-skill', opts: Parameters<typeof makeSourceDir>[1] = {}): CreateSkillInput {
    return { name, sourceDir: makeSourceDir(name, opts), enabled: true };
  }

  describe('findAll', () => {
    it('空数据库返回空数组', () => {
      expect(repo.findAll()).toEqual([]);
    });

    it('返回所有记录，按 created_at DESC 排序', () => {
      repo.create(buildInput('skill-a'));
      repo.create(buildInput('skill-b'));

      const all = repo.findAll();
      expect(all).toHaveLength(2);
      expect(all[0].name).toBe('skill-b');
      expect(all[1].name).toBe('skill-a');
      expect(all[0]).toBeInstanceOf(Skill);
    });
  });

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

  describe('findByIds', () => {
    it('返回匹配的多条记录', () => {
      const s1 = repo.create(buildInput('skill-1'));
      const s2 = repo.create(buildInput('skill-2'));
      repo.create(buildInput('skill-3'));

      const result = repo.findByIds([s1.id, s2.id]);
      expect(result).toHaveLength(2);
      const names = result.map(r => r.name).sort();
      expect(names).toEqual(['skill-1', 'skill-2']);
    });

    it('空数组返回空结果', () => {
      expect(repo.findByIds([])).toEqual([]);
    });
  });

  describe('findEnabled', () => {
    it('仅返回 enabled=true 的记录', () => {
      repo.create({ ...buildInput('enabled-skill'), enabled: true });
      repo.create({ ...buildInput('disabled-skill'), enabled: false });

      const result = repo.findEnabled();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('enabled-skill');
      expect(result[0].enabled).toBe(true);
    });
  });

  describe('findByName', () => {
    it('按名称精确匹配', () => {
      repo.create(buildInput('unique-skill'));
      const found = repo.findByName('unique-skill');
      expect(found).toBeInstanceOf(Skill);
      expect(found!.name).toBe('unique-skill');
    });

    it('名称不匹配返回 null', () => {
      expect(repo.findByName('does-not-exist')).toBeNull();
    });
  });

  describe('create', () => {
    it('生成 UUID、写 DB 行、复制源目录', () => {
      const input = buildInput('full-skill', {
        description: 'Complete skill',
        allowedTools: ['Read', 'Write'],
        extra: { 'scripts/run.sh': '#!/bin/sh' }
      });
      const created = repo.create(input);

      expect(created).toBeInstanceOf(Skill);
      expect(created.id).toMatch(/^[0-9a-f]{8}-/);
      expect(created.name).toBe('full-skill');
      expect(created.dirPath).toBe(path.join(baseDir, 'full-skill'));
      expect(created.description).toBe('Complete skill');
      expect(created.allowedTools).toEqual(['Read', 'Write']);
      expect(fs.existsSync(path.join(baseDir, 'full-skill', 'SKILL.md'))).toBe(true);
      expect(fs.existsSync(path.join(baseDir, 'full-skill', 'scripts', 'run.sh'))).toBe(true);
    });

    it('sourceDir 缺少 SKILL.md 时抛错', () => {
      const bad = path.join(tmpRoot, 'bad');
      fs.mkdirSync(bad, { recursive: true });
      expect(() => repo.create({ name: 'bad', sourceDir: bad })).toThrow(/SKILL\.md/);
    });
  });

  describe('update', () => {
    it('更新 enabled', () => {
      const created = repo.create({ ...buildInput(), enabled: true });
      const updated = repo.update(created.id, { enabled: false });
      expect(updated!.enabled).toBe(false);
    });

    it('不存在的 ID 返回 null', () => {
      expect(repo.update('non-existent', { enabled: true })).toBeNull();
    });

    it('updatedAt 发生变化', async () => {
      const created = repo.create(buildInput());
      await new Promise(r => setTimeout(r, 10));
      const updated = repo.update(created.id, { enabled: false });
      expect(updated!.updatedAt).not.toBe(created.updatedAt);
    });
  });

  describe('setEnabled', () => {
    it('禁用已启用的 Skill', () => {
      const created = repo.create({ ...buildInput(), enabled: true });
      const result = repo.setEnabled(created.id, false);
      expect(result!.enabled).toBe(false);
    });

    it('不存在的 ID 返回 null', () => {
      expect(repo.setEnabled('non-existent', true)).toBeNull();
    });
  });

  describe('remove', () => {
    it('删除 DB 行并删除目录', () => {
      const created = repo.create(buildInput('del'));
      expect(repo.remove(created.id)).toBe(true);
      expect(repo.findById(created.id)).toBeNull();
      expect(fs.existsSync(path.join(baseDir, 'del'))).toBe(false);
    });

    it('删除不存在的记录返回 false', () => {
      expect(repo.remove('non-existent')).toBe(false);
    });
  });
});
