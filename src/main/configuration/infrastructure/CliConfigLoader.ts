/**
 * Claude CLI 配置加载器
 *
 * 从 ~/.claude/skills/ 加载用户的 CLI 配置
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import log from 'electron-log';
import type { McpServerConfig } from '../domain/model/McpServerConfig';

export interface CliSkillDetail {
  name: string;
  description?: string;
  allowedTools?: string[];
  content: string;
}

interface SkillContentInternal {
  name: string;
  description?: string;
  allowedTools?: string[];
  content: string;
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

function parseSkillContent(name: string, content: string): SkillContentInternal {
  const result: SkillContentInternal = { name, content };

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

function scanSkillsDirectory(dir: string, skills: Map<string, SkillContentInternal>): void {
  if (!fs.existsSync(dir)) return;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        const skillFile = path.join(fullPath, 'SKILL.md');
        if (fs.existsSync(skillFile)) {
          const content = readFileOrNull(skillFile);
          if (content) {
            skills.set(entry.name, parseSkillContent(entry.name, content));
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

function scanAllCliSkills(): Map<string, SkillContentInternal> {
  const claudeDir = path.join(os.homedir(), '.claude');
  const skillsPath = path.join(claudeDir, 'skills');
  const pluginsPath = path.join(claudeDir, 'plugins');
  const skills = new Map<string, SkillContentInternal>();

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

  loadClaudeCliSkills(): Record<string, string> {
    const skills = scanAllCliSkills();
    log.debug('Loaded Claude CLI skills', { count: skills.size });

    const result: Record<string, string> = {};
    for (const [name, skill] of skills) {
      result[name] = skill.content;
    }
    return result;
  }

  loadClaudeCliSkillsWithDetails(): CliSkillDetail[] {
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
}
