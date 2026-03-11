/**
 * 配置合并器
 *
 * 合并策略:
 * - rules (systemPrompt): 拼接
 * - allowedTools: 取交集
 * - mcpServers: 取并集
 * - skills: 同名覆盖 (工作流优先)
 *
 * @author zhourui(V33215020)
 * @since 2026/03/11
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import * as yaml from 'yaml';
import log from 'electron-log';
import type {
  GlobalConfig,
  MergedConfig,
  Workflow,
  McpServerConfig
} from '../store/models';

/**
 * 获取全局配置目录路径
 *
 * @returns 全局配置目录绝对路径
 */
function getGlobalConfigPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'global_config');
  }
  return path.join(__dirname, '..', '..', '..', 'global_config');
}

/**
 * 读取文件内容，不存在则返回null
 *
 * @param filePath 文件路径
 * @returns 文件内容或null
 */
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

/**
 * 解析YAML文件，不存在或解析失败则返回空对象
 *
 * @param filePath 文件路径
 * @returns 解析结果或空对象
 */
function parseYamlFile<T>(filePath: string): T | null {
  const content = readFileOrNull(filePath);
  if (!content) {
    return null;
  }

  try {
    return yaml.parse(content) as T;
  } catch (error) {
    log.warn(`Failed to parse YAML file: ${filePath}`, error);
    return null;
  }
}

/**
 * 加载全局配置
 *
 * @returns 全局配置对象
 */
export function loadGlobalConfig(): GlobalConfig {
  const configPath = getGlobalConfigPath();
  const config: GlobalConfig = {};

  const systemPromptPath = path.join(configPath, 'rules', 'system.md');
  const systemPrompt = readFileOrNull(systemPromptPath);
  if (systemPrompt) {
    config.systemPrompt = systemPrompt.trim();
  }

  const settingsPath = path.join(configPath, 'settings.yaml');
  const settings = parseYamlFile<{ default_model?: string; allowed_tools?: string[] }>(
    settingsPath
  );
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

/**
 * 合并全局配置与工作流配置
 *
 * @param globalConfig 全局配置
 * @param workflow 工作流对象
 * @returns 合并后的配置
 */
export function mergeConfig(globalConfig: GlobalConfig, workflow: Workflow): MergedConfig {
  const merged: MergedConfig = {};

  const systemPromptParts: string[] = [];
  if (globalConfig.systemPrompt) {
    systemPromptParts.push(globalConfig.systemPrompt);
  }
  if (workflow.rules) {
    systemPromptParts.push(workflow.rules);
  }
  if (systemPromptParts.length > 0) {
    merged.systemPrompt = systemPromptParts.join('\n\n');
  }

  merged.model = globalConfig.defaultModel;

  if (workflow.mcpServers && Object.keys(workflow.mcpServers).length > 0) {
    if (globalConfig.allowedTools && globalConfig.allowedTools.length > 0) {
      const workflowTools = Object.keys(workflow.mcpServers);
      merged.allowedTools = globalConfig.allowedTools.filter(tool =>
        workflowTools.includes(tool) || !workflowTools.length
      );
    }
  } else {
    merged.allowedTools = globalConfig.allowedTools;
  }

  const mergedMcpServers = {
    ...globalConfig.mcpServers,
    ...workflow.mcpServers
  };
  if (Object.keys(mergedMcpServers).length > 0) {
    merged.mcpServers = mergedMcpServers;
  }

  const mergedSkills = {
    ...globalConfig.skills,
    ...workflow.skills
  };
  if (Object.keys(mergedSkills).length > 0) {
    merged.skills = mergedSkills;
  }

  if (workflow.limits) {
    merged.maxTurns = workflow.limits.maxTurns;
    merged.timeoutMs = workflow.limits.timeoutMs;
  }

  merged.workingDirectory = workflow.workingDirectory;

  return merged;
}

/**
 * 为单个步骤获取合并后的配置
 *
 * @param mergedConfig 基础合并配置
 * @param stepModel 步骤指定的模型
 * @returns 步骤级别的合并配置
 */
export function getStepConfig(mergedConfig: MergedConfig, stepModel?: string): MergedConfig {
  if (!stepModel) {
    return mergedConfig;
  }

  return {
    ...mergedConfig,
    model: stepModel
  };
}
