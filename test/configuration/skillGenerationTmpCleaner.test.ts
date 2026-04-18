/**
 * SkillGenerationTmpCleaner 测试
 *
 * 启动时清理 skillGenerationTmpRoot 下 `skill-gen-*` / `skill-verify-*` 遗留目录。
 * 安全边界：只动已知前缀的直接子项，其他内容保留。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { cleanupSkillGenerationTmp } from '../../src/main/configuration/infrastructure/SkillGenerationTmpCleaner';

describe('cleanupSkillGenerationTmp', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tmp-cleaner-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('删除 skill-gen-* 与 skill-verify-* 子目录', () => {
    fs.mkdirSync(path.join(tmpRoot, 'skill-gen-abc'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'skill-gen-abc', 'x.txt'), 'data');
    fs.mkdirSync(path.join(tmpRoot, 'skill-verify-xyz'), { recursive: true });

    cleanupSkillGenerationTmp(tmpRoot);

    expect(fs.existsSync(path.join(tmpRoot, 'skill-gen-abc'))).toBe(false);
    expect(fs.existsSync(path.join(tmpRoot, 'skill-verify-xyz'))).toBe(false);
  });

  it('保留非目标前缀的目录/文件', () => {
    fs.mkdirSync(path.join(tmpRoot, 'unrelated'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'notes.txt'), 'keep');
    fs.mkdirSync(path.join(tmpRoot, 'skill-gen-keep-me'), { recursive: true });

    cleanupSkillGenerationTmp(tmpRoot);

    expect(fs.existsSync(path.join(tmpRoot, 'unrelated'))).toBe(true);
    expect(fs.existsSync(path.join(tmpRoot, 'notes.txt'))).toBe(true);
    expect(fs.existsSync(path.join(tmpRoot, 'skill-gen-keep-me'))).toBe(false);
  });

  it('root 不存在时 no-op，不抛错', () => {
    const missing = path.join(tmpRoot, 'does-not-exist');
    expect(() => cleanupSkillGenerationTmp(missing)).not.toThrow();
  });

  it('前缀完全匹配：skill-gen 不含连字符时不清理（要求 skill-gen-*）', () => {
    fs.mkdirSync(path.join(tmpRoot, 'skill-gen'), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, 'skill-verify'), { recursive: true });

    cleanupSkillGenerationTmp(tmpRoot);

    expect(fs.existsSync(path.join(tmpRoot, 'skill-gen'))).toBe(true);
    expect(fs.existsSync(path.join(tmpRoot, 'skill-verify'))).toBe(true);
  });
});
