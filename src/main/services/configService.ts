/**
 * 全局配置业务服务
 *
 * @author zhourui(V33215020)
 * @since 2026/03/11
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import * as yaml from 'yaml';
import log from 'electron-log';
import type { GlobalConfig, McpServerConfig } from '../store/models';

/**
 * 获取全局配置目录路径
 *
 * @returns 全局配置目录绝对路径
 */
function getGlobalConfigPath(): string {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'global_config');
  }
  return path.join(__dirname, '..', '..', '..', 'global_config');
}

/**
 * 确保配置目录存在
 */
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

/**
 * 获取全局配置
 *
 * @returns 全局配置对象
 */
export function getConfig(): GlobalConfig {
  const configPath = getGlobalConfigPath();
  const config: GlobalConfig = {};

  const systemPromptPath = path.join(configPath, 'rules', 'system.md');
  if (fs.existsSync(systemPromptPath)) {
    config.systemPrompt = fs.readFileSync(systemPromptPath, 'utf-8').trim();
  }

  const settingsPath = path.join(configPath, 'settings.yaml');
  if (fs.existsSync(settingsPath)) {
    try {
      const settings = yaml.parse(fs.readFileSync(settingsPath, 'utf-8'));
      config.defaultModel = settings?.default_model;
      config.allowedTools = settings?.allowed_tools;
    } catch (error) {
      log.warn('Failed to parse settings.yaml:', error);
    }
  }

  const mcpPath = path.join(configPath, 'mcp', 'servers.yaml');
  if (fs.existsSync(mcpPath)) {
    try {
      config.mcpServers = yaml.parse(fs.readFileSync(mcpPath, 'utf-8'));
    } catch (error) {
      log.warn('Failed to parse mcp/servers.yaml:', error);
    }
  }

  const skillsDir = path.join(configPath, 'skills');
  if (fs.existsSync(skillsDir)) {
    config.skills = {};
    const files = fs.readdirSync(skillsDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const skillName = path.basename(file, '.md');
      config.skills[skillName] = fs.readFileSync(path.join(skillsDir, file), 'utf-8').trim();
    }
  }

  return config;
}

/**
 * 更新全局配置
 *
 * @param data 配置更新数据
 */
export function updateConfig(data: {
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
