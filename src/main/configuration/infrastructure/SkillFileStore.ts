/**
 * Skill 文件存储
 *
 * 管理 global_config/skills/{name}/ 目录的 CRUD：
 * - 每个 skill 是一个子目录，必须包含 SKILL.md
 * - 可选包含 scripts/ references/ assets/ 等附属资源
 * - 名称直接作为目录名，需通过白名单校验防止路径穿越
 */

import * as fs from 'fs';
import * as path from 'path';

const VALID_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

function assertValidName(name: string): void {
  if (!VALID_NAME_RE.test(name)) {
    throw new Error(`非法 Skill 名称: "${name}"`);
  }
}

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

export class SkillFileStore {
  constructor(private readonly baseDir: string) {}

  getBaseDir(): string {
    return this.baseDir;
  }

  getSkillDir(name: string): string {
    assertValidName(name);
    return path.join(this.baseDir, name);
  }

  exists(name: string): boolean {
    if (!VALID_NAME_RE.test(name)) return false;
    const mdPath = path.join(this.baseDir, name, 'SKILL.md');
    return fs.existsSync(mdPath);
  }

  listNames(): string[] {
    if (!fs.existsSync(this.baseDir)) return [];

    const entries = fs.readdirSync(this.baseDir, { withFileTypes: true });
    const result: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!VALID_NAME_RE.test(entry.name)) continue;
      const mdPath = path.join(this.baseDir, entry.name, 'SKILL.md');
      if (fs.existsSync(mdPath)) {
        result.push(entry.name);
      }
    }
    return result;
  }

  readSkillMd(name: string): string | null {
    if (!VALID_NAME_RE.test(name)) return null;
    const mdPath = path.join(this.baseDir, name, 'SKILL.md');
    if (!fs.existsSync(mdPath)) return null;
    return fs.readFileSync(mdPath, 'utf-8');
  }

  /**
   * 把 sourceDir 的全部内容拷贝到 baseDir/{name}/
   *
   * 约束：
   * - name 必须通过白名单校验
   * - sourceDir 必须包含 SKILL.md
   * - baseDir/{name} 不能已存在
   */
  importFromSourceDir(sourceDir: string, name: string): void {
    assertValidName(name);

    const srcMd = path.join(sourceDir, 'SKILL.md');
    if (!fs.existsSync(srcMd)) {
      throw new Error(`源目录缺少 SKILL.md: ${sourceDir}`);
    }

    const dest = path.join(this.baseDir, name);
    if (fs.existsSync(dest)) {
      throw new Error(`Skill 目录已存在: ${name}`);
    }

    fs.mkdirSync(this.baseDir, { recursive: true });
    copyDirRecursive(sourceDir, dest);
  }

  remove(name: string): void {
    assertValidName(name);
    const dir = path.join(this.baseDir, name);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
