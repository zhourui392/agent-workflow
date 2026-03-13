/**
 * Claude CLI 配置加载器
 *
 * 从 ~/.claude.json 和 ~/.claude/skills/ 加载用户的 CLI 配置
 *
 * @author zhourui(V33215020)
 * @since 2026/03/14
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import log from 'electron-log';
import type { McpServerConfig } from '../../store/models';
import { readFileOrNull } from './fileUtils';

/**
 * Claude CLI 配置文件结构（部分）
 */
interface ClaudeCliConfig {
  mcpServers?: Record<string, McpServerConfig & { type?: string }>;
}

/**
 * Skill 内容结构
 */
export interface SkillContent {
  name: string;
  description?: string;
  allowedTools?: string[];
  content: string;
}

/**
 * CLI Skill 详细信息结构
 */
export interface CliSkillDetail {
  name: string;
  description?: string;
  allowedTools?: string[];
  content: string;
}

/**
 * 获取 Claude Code CLI 配置文件路径
 *
 * @returns ~/.claude.json 路径
 */
function getClaudeCliConfigPath(): string {
  return path.join(os.homedir(), '.claude.json');
}

/**
 * 读取 Claude Code CLI 的全局 MCP 配置
 *
 * @returns MCP 服务配置，无配置时返回空对象
 */
export function loadClaudeCliMcpServers(): Record<string, McpServerConfig> {
  const configPath = getClaudeCliConfigPath();
  const content = readFileOrNull(configPath);

  if (!content) {
    return {};
  }

  try {
    const config = JSON.parse(content) as ClaudeCliConfig;
    if (!config.mcpServers) {
      return {};
    }

    const result: Record<string, McpServerConfig> = {};

    for (const [name, server] of Object.entries(config.mcpServers)) {
      if (server.type === 'stdio' || !server.type) {
        result[name] = {
          command: server.command,
          args: server.args,
          env: server.env
        };
      }
    }

    log.debug('Loaded Claude CLI MCP servers', { count: Object.keys(result).length });
    return result;
  } catch (error) {
    log.warn('Failed to parse Claude CLI config', { path: configPath, error });
    return {};
  }
}

/**
 * 递归扫描目录查找 SKILL.md 文件
 *
 * @param dir 目录路径
 * @param skills 结果集合
 */
function scanSkillsDirectory(dir: string, skills: Map<string, SkillContent>): void {
  if (!fs.existsSync(dir)) {
    return;
  }

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        const skillFile = path.join(fullPath, 'SKILL.md');
        if (fs.existsSync(skillFile)) {
          const content = readFileOrNull(skillFile);
          if (content) {
            const skillContent = parseSkillContent(entry.name, content);
            skills.set(entry.name, skillContent);
          }
        } else {
          scanSkillsDirectory(fullPath, skills);
        }
      }
    }
  } catch (error) {
    log.warn('Failed to scan skills directory', { dir, error });
  }
}

/**
 * 解析 SKILL.md 文件内容，提取 frontmatter
 *
 * @param name Skill 名称
 * @param content 文件内容
 * @returns 解析后的 Skill 内容
 */
export function parseSkillContent(name: string, content: string): SkillContent {
  const result: SkillContent = { name, content };

  if (content.startsWith('---')) {
    const endIndex = content.indexOf('---', 3);
    if (endIndex > 0) {
      const frontmatter = content.substring(3, endIndex).trim();
      result.content = content.substring(endIndex + 3).trim();

      for (const line of frontmatter.split('\n')) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.substring(0, colonIndex).trim();
          const value = line.substring(colonIndex + 1).trim();

          if (key === 'description') {
            result.description = value;
          } else if (key === 'allowed-tools') {
            result.allowedTools = value.split(',').map(t => t.trim());
          }
        }
      }
    }
  }

  return result;
}

/**
 * 扫描 CLI Skills 目录，返回内部 SkillContent Map
 *
 * 扫描路径:
 * 1. ~/.claude/skills/*.md（直接 md 文件）
 * 2. ~/.claude/skills/<name>/SKILL.md（标准目录格式）
 * 3. ~/.claude/plugins/（递归扫描所有 SKILL.md）
 */
function scanAllCliSkills(): Map<string, SkillContent> {
  const claudeDir = path.join(os.homedir(), '.claude');
  const skillsPath = path.join(claudeDir, 'skills');
  const pluginsPath = path.join(claudeDir, 'plugins');
  const skills = new Map<string, SkillContent>();

  if (fs.existsSync(skillsPath)) {
    try {
      const entries = fs.readdirSync(skillsPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(skillsPath, entry.name);

        if (entry.isFile() && entry.name.endsWith('.md')) {
          const skillName = path.basename(entry.name, '.md');
          const content = readFileOrNull(fullPath);
          if (content) {
            skills.set(skillName, parseSkillContent(skillName, content));
          }
        } else if (entry.isDirectory()) {
          const skillFile = path.join(fullPath, 'SKILL.md');
          if (fs.existsSync(skillFile)) {
            const content = readFileOrNull(skillFile);
            if (content) {
              skills.set(entry.name, parseSkillContent(entry.name, content));
            }
          }
        }
      }
    } catch (error) {
      log.warn('Failed to load skills from ~/.claude/skills', { path: skillsPath, error });
    }
  }

  if (fs.existsSync(pluginsPath)) {
    scanSkillsDirectory(pluginsPath, skills);
  }

  return skills;
}

/**
 * 读取用户的 Skills 配置
 *
 * @returns Skills 配置（name → content），无配置时返回空对象
 */
export function loadClaudeCliSkills(): Record<string, string> {
  const skills = scanAllCliSkills();

  log.debug('Loaded Claude CLI skills', { count: skills.size });

  const result: Record<string, string> = {};
  for (const [name, skill] of skills) {
    result[name] = skill.content;
  }
  return result;
}

/**
 * 读取用户的 Skills 配置（带详细信息）
 *
 * @returns Skills 详细信息数组
 */
export function loadClaudeCliSkillsWithDetails(): CliSkillDetail[] {
  const skills = scanAllCliSkills();

  log.debug('Loaded Claude CLI skills with details', { count: skills.size });

  const result: CliSkillDetail[] = [];
  for (const [, skill] of skills) {
    result.push({
      name: skill.name,
      description: skill.description,
      allowedTools: skill.allowedTools,
      content: skill.content
    });
  }
  return result;
}
