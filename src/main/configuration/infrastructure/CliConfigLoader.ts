/**
 * Claude CLI 配置加载器
 *
 * 从 ~/.claude/skills/ 和 ~/.claude/plugins/ 加载目录形式的 CLI skills。
 *
 * 返回值 value 为 skill 源目录绝对路径（含 SKILL.md）。
 * 单文件（*.md 直接放在 skills/ 下）形式已不支持，会被忽略。
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import log from '../../shared/infrastructure/logger';
import type { McpServerConfig } from '../domain/model/McpServerConfig';
import { parseSkillMd, SkillDraftParseError } from '../domain/service/SkillDraftParser';

export interface CliSkillDetail {
  name: string;
  dirPath: string;
  description?: string;
  allowedTools?: string[];
}

function readFileOrNull(filePath: string): string | null {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
  } catch (error) {
    log.warn(`Failed to read file: ${filePath}`, error);
  }
  return null;
}

function readSkillMeta(dirPath: string): { description?: string; allowedTools?: string[] } {
  const mdPath = path.join(dirPath, 'SKILL.md');
  const md = readFileOrNull(mdPath);
  if (!md) return {};
  try {
    const parsed = parseSkillMd(md);
    return { description: parsed.description, allowedTools: parsed.allowedTools };
  } catch (error) {
    if (!(error instanceof SkillDraftParseError)) throw error;
    return {};
  }
}

function scanSkillsDirectory(dir: string, skills: Map<string, string>): void {
  if (!fs.existsSync(dir)) return;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        const skillFile = path.join(fullPath, 'SKILL.md');
        if (fs.existsSync(skillFile)) {
          skills.set(entry.name, fullPath);
        } else {
          scanSkillsDirectory(fullPath, skills);
        }
      }
    }
  } catch (error) {
    log.warn('Failed to scan skills directory', { dir, error });
  }
}

function scanAllCliSkills(): Map<string, string> {
  const claudeDir = path.join(os.homedir(), '.claude');
  const skillsPath = path.join(claudeDir, 'skills');
  const pluginsPath = path.join(claudeDir, 'plugins');
  const skills = new Map<string, string>();

  if (fs.existsSync(skillsPath)) {
    try {
      const entries = fs.readdirSync(skillsPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const fullPath = path.join(skillsPath, entry.name);
        const skillFile = path.join(fullPath, 'SKILL.md');
        if (fs.existsSync(skillFile)) {
          skills.set(entry.name, fullPath);
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
 * 解析 .mcp.json 文件，提取合法的 MCP server 配置
 */
export function parseMcpJsonFile(filePath: string): Record<string, McpServerConfig> {
  const content = readFileOrNull(filePath);
  if (!content) return {};

  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object' || !parsed.mcpServers || typeof parsed.mcpServers !== 'object') {
      return {};
    }

    const result: Record<string, McpServerConfig> = {};
    for (const [name, config] of Object.entries(parsed.mcpServers)) {
      if (typeof config !== 'object' || config === null) continue;
      const cfg = config as Record<string, unknown>;
      if (typeof cfg.command !== 'string') continue;

      const entry: McpServerConfig = { command: cfg.command };
      if (Array.isArray(cfg.args) && cfg.args.every((a: unknown) => typeof a === 'string')) {
        entry.args = cfg.args as string[];
      }
      if (cfg.env && typeof cfg.env === 'object' && !Array.isArray(cfg.env)) {
        const env: Record<string, string> = {};
        for (const [k, v] of Object.entries(cfg.env as Record<string, unknown>)) {
          if (typeof v === 'string') env[k] = v;
        }
        if (Object.keys(env).length > 0) entry.env = env;
      }
      result[name] = entry;
    }

    return result;
  } catch (error) {
    log.warn(`Failed to parse MCP config file: ${filePath}`, error);
    return {};
  }
}

export class CliConfigLoader {
  /**
   * 加载 ~/.claude/.mcp.json 中的 MCP server 配置
   */
  loadMcpServers(): Record<string, McpServerConfig> {
    const mcpJsonPath = path.join(os.homedir(), '.claude', '.mcp.json');
    const servers = parseMcpJsonFile(mcpJsonPath);
    log.debug('Loaded MCP servers from CLI config', { count: Object.keys(servers).length });
    return servers;
  }

  /**
   * 返回 CLI skills 的 name → 源目录绝对路径 映射
   */
  loadClaudeCliSkills(): Record<string, string> {
    const skills = scanAllCliSkills();
    log.debug('Loaded Claude CLI skills', { count: skills.size });

    return Object.fromEntries(skills.entries());
  }

  loadClaudeCliSkillsWithDetails(): CliSkillDetail[] {
    const skills = scanAllCliSkills();
    log.debug('Loaded Claude CLI skills with details', { count: skills.size });

    const result: CliSkillDetail[] = [];
    for (const [name, dirPath] of skills) {
      const meta = readSkillMeta(dirPath);
      result.push({
        name,
        dirPath,
        description: meta.description,
        allowedTools: meta.allowedTools
      });
    }
    return result;
  }
}
