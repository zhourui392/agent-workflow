/**
 * Skill 文件写入器
 *
 * 负责步骤级 Skills 的写入隔离目录和清理
 */

import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';
import { SkillWriteError } from '../domain/model';
import type { SkillContent, SkillFileWriter as ISkillFileWriter } from '../domain/service/ConfigMergeService';

function toSafeDirectoryName(name: string): string {
  return name.replace(/[:\\/*?"<>|]/g, '_');
}

function validateSkillName(name: string, safeName: string): void {
  if (safeName.includes('..') || path.isAbsolute(safeName)) {
    throw new Error(`非法 Skill 名称: "${name}"`);
  }
}

function buildSkillFileContent(skill: SkillContent): string {
  const frontmatterParts: string[] = [];

  if (skill.description) {
    frontmatterParts.push(`description: ${skill.description}`);
  }
  if (skill.allowedTools && skill.allowedTools.length > 0) {
    frontmatterParts.push(`allowed-tools: ${skill.allowedTools.join(', ')}`);
  }

  if (frontmatterParts.length > 0) {
    return `---\n${frontmatterParts.join('\n')}\n---\n\n${skill.content}`;
  }

  return skill.content;
}

export class SkillFileWriterImpl implements ISkillFileWriter {
  writeStepSkills(
    workingDirectory: string,
    executionId: string,
    stepIndex: number,
    skills: Map<string, SkillContent>
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
      const skillDir = path.join(skillsDir, safeName);

      try {
        fs.mkdirSync(skillDir, { recursive: true });
        const content = buildSkillFileContent(skill);
        fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content, 'utf-8');
      } catch (error) {
        log.error('Skill 文件写入失败', {
          skillName: skill.name,
          safeName,
          skillsDir,
          error: error instanceof Error ? error.message : String(error)
        });

        throw new SkillWriteError(
          `无法写入 Skill "${skill.name}": ${error instanceof Error ? error.message : String(error)}`,
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
