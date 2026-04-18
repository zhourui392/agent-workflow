/**
 * Skill 文件写入器
 *
 * 将 skill 的源目录（包含 SKILL.md 及可选 scripts/references/assets）
 * 递归复制到步骤隔离目录 .claude/skills-{executionId}-{stepIndex}/{name}/ 下，
 * 供 Claude SDK 通过 plugin-dir 参数挂载。
 */

import * as fs from 'fs';
import * as path from 'path';
import log from '../../shared/infrastructure/logger';
import { SkillWriteError } from '../domain/model';
import type { SkillSource, SkillFileWriter as ISkillFileWriter } from '../domain/service/ConfigMergeService';

function toSafeDirectoryName(name: string): string {
  return name.replace(/[:\\/*?"<>|]/g, '_');
}

function validateSkillName(name: string, safeName: string): void {
  if (safeName.includes('..') || path.isAbsolute(safeName)) {
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

export class SkillFileWriterImpl implements ISkillFileWriter {
  writeStepSkills(
    workingDirectory: string,
    executionId: string,
    stepIndex: number,
    skills: Map<string, SkillSource>
  ): string | undefined {
    if (skills.size === 0) return undefined;

    const skillsDir = path.join(
      workingDirectory,
      '.claude',
      `skills-${executionId}-${stepIndex}`
    );

    fs.mkdirSync(skillsDir, { recursive: true });

    for (const skill of skills.values()) {
      const safeName = toSafeDirectoryName(skill.name);
      validateSkillName(skill.name, safeName);

      if (!fs.existsSync(path.join(skill.sourceDir, 'SKILL.md'))) {
        log.warn('跳过缺少 SKILL.md 的 skill', { name: skill.name, sourceDir: skill.sourceDir });
        continue;
      }

      const destDir = path.join(skillsDir, safeName);
      try {
        copyDirRecursive(skill.sourceDir, destDir);
      } catch (error) {
        log.error('Skill 目录复制失败', {
          skillName: skill.name,
          sourceDir: skill.sourceDir,
          destDir,
          error: error instanceof Error ? error.message : String(error)
        });

        throw new SkillWriteError(
          `无法复制 Skill "${skill.name}": ${error instanceof Error ? error.message : String(error)}`,
          skill.name
        );
      }
    }

    return skillsDir;
  }

  cleanupStepSkills(skillsDir: string): void {
    try {
      fs.rmSync(skillsDir, { recursive: true, force: true });
    } catch (error) {
      log.warn('清理 Skills 目录失败', { skillsDir, error });
    }
  }
}
