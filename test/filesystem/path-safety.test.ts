import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { assertUnderRoot, PathOutOfRootError } from '../../src/main/filesystem/pathSafety';
import { FsConfig } from '../../src/main/filesystem/FsConfig';

describe('assertUnderRoot', () => {
  const roots = ['/home/user/projects', '/tmp/work'];

  it('accepts exact root', () => {
    expect(assertUnderRoot('/home/user/projects', roots)).toBe('/home/user/projects');
  });

  it('accepts subdirectory', () => {
    expect(assertUnderRoot('/home/user/projects/repo/src', roots))
      .toBe('/home/user/projects/repo/src');
  });

  it('rejects sibling path', () => {
    expect(() => assertUnderRoot('/home/user/other', roots)).toThrow(PathOutOfRootError);
  });

  it('rejects path traversal with ..', () => {
    expect(() => assertUnderRoot('/home/user/projects/../other', roots)).toThrow(PathOutOfRootError);
  });

  it('rejects prefix collision (not a real subdirectory)', () => {
    // /home/user/projects-evil should NOT match /home/user/projects
    expect(() => assertUnderRoot('/home/user/projects-evil', roots)).toThrow(PathOutOfRootError);
  });

  it('rejects empty input', () => {
    expect(() => assertUnderRoot('', roots)).toThrow(PathOutOfRootError);
    expect(() => assertUnderRoot('   ', roots)).toThrow(PathOutOfRootError);
  });

  it('normalizes relative path against cwd', () => {
    const cwd = process.cwd();
    const result = assertUnderRoot('.', [cwd]);
    expect(result).toBe(cwd);
  });
});

describe('FsConfig', () => {
  it('defaults to process.cwd() when FS_ROOTS and yaml are unset', () => {
    const cfg = new FsConfig({}, {});
    expect(cfg.roots).toEqual([process.cwd()]);
  });

  it('parses FS_ROOTS comma-separated (env overrides yaml)', () => {
    const cfg = new FsConfig({ FS_ROOTS: '/tmp/a, /tmp/b' }, { fs: { roots: ['/ignored'] } });
    expect(cfg.roots).toContain(path.resolve('/tmp/a'));
    expect(cfg.roots).toContain(path.resolve('/tmp/b'));
    expect(cfg.roots).not.toContain(path.resolve('/ignored'));
  });

  it('dedupes roots', () => {
    const cfg = new FsConfig({ FS_ROOTS: '/tmp/x,/tmp/x' }, {});
    expect(cfg.roots).toHaveLength(1);
  });

  it('falls back to yaml fs.roots when env is unset', () => {
    const cfg = new FsConfig({}, { fs: { roots: ['/tmp/yaml-a', '/tmp/yaml-b'] } });
    expect(cfg.roots).toContain(path.resolve('/tmp/yaml-a'));
    expect(cfg.roots).toContain(path.resolve('/tmp/yaml-b'));
  });
});
