/**
 * SkillFileStore 单元测试
 *
 * 管理 global_config/skills/{name}/ 目录的 CRUD。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SkillFileStore } from '../../src/main/configuration/infrastructure/SkillFileStore';

describe('SkillFileStore', () => {
  let tmpRoot: string;
  let baseDir: string;
  let store: SkillFileStore;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skillfilestore-'));
    baseDir = path.join(tmpRoot, 'skills');
    store = new SkillFileStore(baseDir);
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  function writeSource(name: string, files: Record<string, string>): string {
    const src = path.join(tmpRoot, 'src', name);
    fs.mkdirSync(src, { recursive: true });
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(src, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content, 'utf-8');
    }
    return src;
  }

  // ========== exists ==========
  describe('exists', () => {
    it('目录不存在时返回 false', () => {
      expect(store.exists('no-such')).toBe(false);
    });

    it('只有目录但缺少 SKILL.md 时返回 false', () => {
      fs.mkdirSync(path.join(baseDir, 'no-md'), { recursive: true });
      expect(store.exists('no-md')).toBe(false);
    });

    it('SKILL.md 存在时返回 true', () => {
      const src = writeSource('ok', { 'SKILL.md': '---\nname: ok\n---\n' });
      store.importFromSourceDir(src, 'ok');
      expect(store.exists('ok')).toBe(true);
    });
  });

  // ========== listNames ==========
  describe('listNames', () => {
    it('baseDir 不存在时返回空数组', () => {
      expect(store.listNames()).toEqual([]);
    });

    it('仅列出含 SKILL.md 的子目录', () => {
      const a = writeSource('a', { 'SKILL.md': '---\nname: a\n---\n' });
      const b = writeSource('b', { 'SKILL.md': '---\nname: b\n---\n' });
      store.importFromSourceDir(a, 'a');
      store.importFromSourceDir(b, 'b');
      fs.mkdirSync(path.join(baseDir, 'c-no-md'), { recursive: true });

      const names = store.listNames().sort();
      expect(names).toEqual(['a', 'b']);
    });

    it('忽略非目录条目', () => {
      fs.mkdirSync(baseDir, { recursive: true });
      fs.writeFileSync(path.join(baseDir, 'random.txt'), 'x', 'utf-8');
      expect(store.listNames()).toEqual([]);
    });
  });

  // ========== readSkillMd ==========
  describe('readSkillMd', () => {
    it('返回 SKILL.md 文本', () => {
      const src = writeSource('r', { 'SKILL.md': '---\nname: r\n---\nbody' });
      store.importFromSourceDir(src, 'r');
      expect(store.readSkillMd('r')).toContain('body');
    });

    it('不存在时返回 null', () => {
      expect(store.readSkillMd('missing')).toBeNull();
    });
  });

  // ========== importFromSourceDir ==========
  describe('importFromSourceDir', () => {
    it('拷贝 SKILL.md + 子目录（scripts/references）', () => {
      const src = writeSource('full', {
        'SKILL.md': 'md',
        'scripts/run.sh': '#!/bin/sh',
        'references/note.md': 'note'
      });
      store.importFromSourceDir(src, 'full');

      const dest = path.join(baseDir, 'full');
      expect(fs.existsSync(path.join(dest, 'SKILL.md'))).toBe(true);
      expect(fs.existsSync(path.join(dest, 'scripts', 'run.sh'))).toBe(true);
      expect(fs.existsSync(path.join(dest, 'references', 'note.md'))).toBe(true);
    });

    it('同名目录已存在时抛错且不覆盖原内容', () => {
      const src1 = writeSource('dup', { 'SKILL.md': 'v1' });
      store.importFromSourceDir(src1, 'dup');
      const src2 = writeSource('dup-v2', { 'SKILL.md': 'v2' });

      expect(() => store.importFromSourceDir(src2, 'dup')).toThrow(/already exists|已存在/i);
      expect(store.readSkillMd('dup')).toBe('v1');
    });

    it('源目录缺少 SKILL.md 时抛错', () => {
      const src = writeSource('broken', { 'other.md': 'x' });
      expect(() => store.importFromSourceDir(src, 'broken')).toThrow(/SKILL\.md/);
    });

    it('非法名称拒绝（路径穿越）', () => {
      const src = writeSource('evil', { 'SKILL.md': 'x' });
      expect(() => store.importFromSourceDir(src, '../escape')).toThrow();
      expect(() => store.importFromSourceDir(src, 'a/b')).toThrow();
      expect(() => store.importFromSourceDir(src, '')).toThrow();
    });

    it('非法名称拒绝（特殊字符）', () => {
      const src = writeSource('evil2', { 'SKILL.md': 'x' });
      expect(() => store.importFromSourceDir(src, 'name with space')).toThrow();
      expect(() => store.importFromSourceDir(src, 'name$')).toThrow();
    });

    it('合法名称允许字母/数字/下划线/连字符', () => {
      const src = writeSource('valid-Name_1', { 'SKILL.md': 'ok' });
      expect(() => store.importFromSourceDir(src, 'valid-Name_1')).not.toThrow();
      expect(store.exists('valid-Name_1')).toBe(true);
    });
  });

  // ========== remove ==========
  describe('remove', () => {
    it('删除存在的 skill 目录', () => {
      const src = writeSource('del', { 'SKILL.md': 'x' });
      store.importFromSourceDir(src, 'del');
      expect(store.exists('del')).toBe(true);

      store.remove('del');
      expect(store.exists('del')).toBe(false);
      expect(fs.existsSync(path.join(baseDir, 'del'))).toBe(false);
    });

    it('删除不存在的 skill 不抛错', () => {
      expect(() => store.remove('never-existed')).not.toThrow();
    });

    it('非法名称拒绝', () => {
      expect(() => store.remove('../escape')).toThrow();
    });
  });

  // ========== getSkillDir ==========
  describe('getSkillDir', () => {
    it('返回绝对路径', () => {
      const dir = store.getSkillDir('x');
      expect(path.isAbsolute(dir)).toBe(true);
      expect(dir).toBe(path.join(baseDir, 'x'));
    });

    it('非法名称拒绝', () => {
      expect(() => store.getSkillDir('..')).toThrow();
    });
  });
});
