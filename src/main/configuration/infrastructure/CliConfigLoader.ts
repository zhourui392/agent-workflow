/**
 * Claude CLI 配置加载器
 *
 * 从 ~/.claude/skills/ 加载用户的 CLI 配置
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import log from 'electron-log';

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

export class CliConfigLoader {
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
