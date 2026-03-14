/**
 * 技能文件管理器
 *
 * 负责步骤级 Skills 的合并、写入隔离目录和清理
 *
 * @author zhourui(V33215020)
 * @since 2026/03/14
 */

import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';
import { skillRepository } from '../../store/repositories';
import { SkillWriteError } from '../errors';
import type { SkillContent } from './cliConfigLoader';

/**
 * 将 skill 名称转换为安全的目录名
 *
 * Windows 系统不允许文件名包含 : \ / * ? " < > | 等字符
 *
 * @param name Skill 名称
 * @returns 安全的目录名
 */
function toSafeDirectoryName(name: string): string {
  return name.replace(/[:\\/*?"<>|]/g, '_');
}

/**
 * 校验 Skill 名称，防止路径穿越攻击
 *
 * @param name 原始 Skill 名称
 * @param safeName 转换后的安全目录名
 */
function validateSkillName(name: string, safeName: string): void {
  if (safeName.includes('..') || path.isAbsolute(safeName)) {
    throw new Error(`非法 Skill 名称: "${name}"`);
  }
}

/**
 * 生成 SKILL.md 文件内容
 *
 * @param skill Skill 配置
 * @returns SKILL.md 文件内容
 */
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

/**
 * 写入单个 Skill 文件
 *
 * @param skillsDir Skills 隔离目录
 * @param skill Skill 配置
 */
function writeSkillFile(skillsDir: string, skill: SkillContent): void {
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

/**
 * 写入步骤的 Skills 到隔离目录（按需加载模式）
 *
 * 合并优先级（从低到高）：
 * 1. 磁盘全局 Skills
 * 2. 工作流 Skills
 * 3. 步骤引用的数据库 Skills
 *
 * @param workingDirectory 工作目录
 * @param executionId 执行 ID
 * @param stepIndex 步骤索引
 * @param diskSkills 磁盘全局 Skills
 * @param workflowSkills 工作流 Skills
 * @param stepSkillIds 步骤引用的 Skill ID 列表
 * @returns 隔离目录路径，无 Skills 时返回 undefined
 */
export function writeStepSkills(
  workingDirectory: string,
  executionId: string,
  stepIndex: number,
  diskSkills: Record<string, string> | undefined,
  workflowSkills: Record<string, string> | undefined,
  stepSkillIds: string[] = []
): string | undefined {
  const mergedSkills = new Map<string, SkillContent>();

  if (diskSkills) {
    for (const [name, content] of Object.entries(diskSkills)) {
      mergedSkills.set(name, { name, content });
    }
  }

  if (workflowSkills) {
    for (const [name, content] of Object.entries(workflowSkills)) {
      mergedSkills.set(name, { name, content });
    }
  }

  if (stepSkillIds.length > 0) {
    const stepSkills = skillRepository.findByIds(stepSkillIds);
    for (const skill of stepSkills) {
      mergedSkills.set(skill.name, {
        name: skill.name,
        description: skill.description,
        allowedTools: skill.allowedTools,
        content: skill.content
      });
    }
  }

  if (mergedSkills.size === 0) {
    return undefined;
  }

  const skillsDir = path.join(
    workingDirectory,
    '.claude',
    `skills-${executionId}-${stepIndex}`
  );

  fs.mkdirSync(skillsDir, { recursive: true });

  for (const skill of mergedSkills.values()) {
    writeSkillFile(skillsDir, skill);
  }

  return skillsDir;
}

/**
 * 清理步骤执行的 Skills 隔离目录
 *
 * @param skillsDir 隔离目录路径
 */
export function cleanupStepSkills(skillsDir: string): void {
  try {
    fs.rmSync(skillsDir, { recursive: true, force: true });
  } catch (error) {
    log.warn('清理 Skills 目录失败', { skillsDir, error });
  }
}
