/**
 * 磁盘全局配置仓库
 *
 * 管理 global_config/ 目录下的配置文件读写
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import * as yaml from 'yaml';
import log from 'electron-log';
import type { GlobalConfig, McpServerConfig } from '../domain/model';

function getGlobalConfigPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'global_config');
  }
  return path.join(__dirname, '..', '..', '..', '..', 'global_config');
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

function parseYamlFile<T>(filePath: string): T | null {
  const content = readFileOrNull(filePath);
  if (!content) return null;

  try {
    return yaml.parse(content) as T;
  } catch (error) {
    log.warn(`Failed to parse YAML file: ${filePath}`, error);
    return null;
  }
}

function ensureConfigDirs(): void {
  const configPath = getGlobalConfigPath();
  const dirs = [
    configPath,
    path.join(configPath, 'rules'),
    path.join(configPath, 'mcp'),
    path.join(configPath, 'skills')
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export class DiskGlobalConfigRepository {
  getConfig(): GlobalConfig {
    const configPath = getGlobalConfigPath();
    const config: GlobalConfig = {};

    const systemPromptPath = path.join(configPath, 'rules', 'system.md');
    const systemPrompt = readFileOrNull(systemPromptPath);
    if (systemPrompt) {
      config.systemPrompt = systemPrompt.trim();
    }

    const settingsPath = path.join(configPath, 'settings.yaml');
    const settings = parseYamlFile<{ default_model?: string; allowed_tools?: string[] }>(settingsPath);
    if (settings) {
      config.defaultModel = settings.default_model;
      config.allowedTools = settings.allowed_tools;
    }

    const mcpPath = path.join(configPath, 'mcp', 'servers.yaml');
    const mcpConfig = parseYamlFile<Record<string, McpServerConfig>>(mcpPath);
    if (mcpConfig) {
      config.mcpServers = mcpConfig;
    }

    const skillsDir = path.join(configPath, 'skills');
    if (fs.existsSync(skillsDir)) {
      config.skills = {};
      const files = fs.readdirSync(skillsDir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const skillName = path.basename(file, '.md');
        const skillContent = readFileOrNull(path.join(skillsDir, file));
        if (skillContent) {
          config.skills[skillName] = skillContent.trim();
        }
      }
    }

    return config;
  }

  updateConfig(data: {
    systemPrompt?: string;
    defaultModel?: string;
    mcpServers?: Record<string, McpServerConfig>;
  }): void {
    ensureConfigDirs();
    const configPath = getGlobalConfigPath();

    if (data.systemPrompt !== undefined) {
      const systemPromptPath = path.join(configPath, 'rules', 'system.md');
      fs.writeFileSync(systemPromptPath, data.systemPrompt, 'utf-8');
      log.info('Updated system prompt');
    }

    if (data.defaultModel !== undefined || data.mcpServers === undefined) {
      const settingsPath = path.join(configPath, 'settings.yaml');
      let settings: Record<string, unknown> = {};

      if (fs.existsSync(settingsPath)) {
        try {
          settings = yaml.parse(fs.readFileSync(settingsPath, 'utf-8')) || {};
        } catch {
          settings = {};
        }
      }

      if (data.defaultModel !== undefined) {
        settings.default_model = data.defaultModel;
      }

      fs.writeFileSync(settingsPath, yaml.stringify(settings), 'utf-8');
      log.info('Updated settings.yaml');
    }

    if (data.mcpServers !== undefined) {
      const mcpPath = path.join(configPath, 'mcp', 'servers.yaml');
      fs.writeFileSync(mcpPath, yaml.stringify(data.mcpServers), 'utf-8');
      log.info('Updated MCP servers config');
    }
  }
}
