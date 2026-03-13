/**
 * 配置合并器
 *
 * 四层合并策略（按需加载模式）:
 * - 第一层：Claude Code CLI 全局配置（~/.claude.json, ~/.claude/plugins/）
 * - 第二层：应用磁盘全局配置（global_config/）
 * - 第三层：工作流配置（workflow.mcpServers / workflow.skills）
 * - 第四层：步骤引用（step.mcpServerIds / step.skillIds）
 *
 * 合并规则:
 * - rules (systemPrompt): 拼接
 * - allowedTools: 取交集
 * - mcpServers: 取并集，同名后者覆盖
 * - skills: 同名后者覆盖
 *
 * @author zhourui(V33215020)
 * @since 2026/03/11
 */

import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';
import type {
  GlobalConfig,
  MergedConfig,
  Workflow,
  WorkflowStep,
  McpServerConfig
} from '../../store/models';
import { mcpServerRepository, skillRepository } from '../../store/repositories';
import type { ReferenceValidationResult } from '../errors';
import { getGlobalConfigPath, readFileOrNull, parseYamlFile } from './fileUtils';
import { loadClaudeCliMcpServers, loadClaudeCliSkills } from './cliConfigLoader';
import { writeStepSkills, cleanupStepSkills } from './skillManager';
import { mergeStepMcpServers } from './mcpServerBuilder';

/**
 * 步骤级合并配置
 *
 * @author zhourui(V33215020)
 * @since 2026/03/12
 */
export interface StepMergedConfig extends MergedConfig {
  skillsDir?: string;
  hasSkills: boolean;
}

/**
 * 加载全局配置
 *
 * 合并顺序（后者覆盖前者）：
 * 1. Claude Code CLI 配置（~/.claude.json, ~/.claude/plugins/）
 * 2. 应用全局配置（global_config/）
 *
 * @returns 全局配置对象
 */
export function loadGlobalConfig(): GlobalConfig {
  const config: GlobalConfig = {};

  const cliMcpServers = loadClaudeCliMcpServers();
  if (Object.keys(cliMcpServers).length > 0) {
    config.mcpServers = cliMcpServers;
  }

  const cliSkills = loadClaudeCliSkills();
  if (Object.keys(cliSkills).length > 0) {
    config.skills = cliSkills;
  }

  const configPath = getGlobalConfigPath();

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
    config.mcpServers = { ...config.mcpServers, ...mcpConfig };
  }

  const skillsDir = path.join(configPath, 'skills');
  if (fs.existsSync(skillsDir)) {
    if (!config.skills) {
      config.skills = {};
    }
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
 * @param stepMaxTurns 步骤指定的最大轮次
 * @returns 步骤级别的合并配置
 */
export function getStepConfig(
  mergedConfig: MergedConfig,
  stepModel?: string,
  stepMaxTurns?: number
): MergedConfig {
  if (!stepModel && !stepMaxTurns) {
    return mergedConfig;
  }

  return {
    ...mergedConfig,
    ...(stepModel && { model: stepModel }),
    ...(stepMaxTurns && { maxTurns: stepMaxTurns })
  };
}

/**
 * 校验配置引用有效性
 *
 * @param mcpServerIds MCP 服务 ID 列表
 * @param skillIds Skill ID 列表
 * @returns 校验结果
 */
export function validateConfigReferences(
  mcpServerIds: string[],
  skillIds: string[]
): ReferenceValidationResult {
  const missingMcpIds: string[] = [];
  const missingSkillIds: string[] = [];

  if (mcpServerIds.length > 0) {
    const foundServers = mcpServerRepository.findByIds(mcpServerIds);
    const foundIds = new Set(foundServers.map(s => s.id));
    for (const id of mcpServerIds) {
      if (!foundIds.has(id)) {
        missingMcpIds.push(id);
      }
    }
  }

  if (skillIds.length > 0) {
    const foundSkills = skillRepository.findByIds(skillIds);
    const foundIds = new Set(foundSkills.map(s => s.id));
    for (const id of skillIds) {
      if (!foundIds.has(id)) {
        missingSkillIds.push(id);
      }
    }
  }

  return {
    valid: missingMcpIds.length === 0 && missingSkillIds.length === 0,
    missingMcpIds,
    missingSkillIds
  };
}

/**
 * 处理悬挂引用（警告并跳过无效引用）
 *
 * @param result 校验结果
 * @param onWarning 警告回调
 */
export function handleDanglingReferences(
  result: ReferenceValidationResult,
  onWarning?: (message: string) => void
): void {
  if (result.valid) {
    return;
  }

  if (result.missingMcpIds.length > 0) {
    const message = `MCP 配置不存在: ${result.missingMcpIds.join(', ')}`;
    log.warn('MCP 配置引用不存在', { ids: result.missingMcpIds });
    onWarning?.(message);
  }

  if (result.missingSkillIds.length > 0) {
    const message = `Skill 配置不存在: ${result.missingSkillIds.join(', ')}`;
    log.warn('Skill 配置引用不存在', { ids: result.missingSkillIds });
    onWarning?.(message);
  }
}

/**
 * 生成步骤的 allowedTools 列表
 *
 * @param baseAllowedTools 基础工具列表
 * @param mcpServers 合并后的 MCP 配置
 * @param hasSkills 是否有 Skills
 * @returns 完整的 allowedTools 列表
 */
export function buildAllowedTools(
  baseAllowedTools: string[] | undefined,
  mcpServers: Record<string, McpServerConfig>,
  hasSkills: boolean
): string[] {
  const result: string[] = [];

  if (baseAllowedTools) {
    result.push(...baseAllowedTools);
  }

  for (const serverName of Object.keys(mcpServers)) {
    const mcpPattern = `mcp__${serverName}__*`;
    if (!result.includes(mcpPattern)) {
      result.push(mcpPattern);
    }
  }

  if (hasSkills && !result.includes('Skill')) {
    result.push('Skill');
  }

  return result;
}

/**
 * 为步骤构建完整的合并配置
 *
 * @param baseConfig 基础合并配置
 * @param workflow 工作流对象
 * @param step 步骤对象
 * @param executionId 执行 ID
 * @param stepIndex 步骤索引
 * @param onWarning 警告回调
 * @returns 步骤级合并配置
 */
export function buildStepMergedConfig(
  baseConfig: MergedConfig,
  workflow: Workflow,
  step: WorkflowStep,
  executionId: string,
  stepIndex: number,
  onWarning?: (message: string) => void
): StepMergedConfig {
  const workingDirectory = baseConfig.workingDirectory || process.cwd();
  const stepMcpIds = step.mcpServerIds || [];
  const stepSkillIds = step.skillIds || [];

  if (stepMcpIds.length > 0 || stepSkillIds.length > 0) {
    const validationResult = validateConfigReferences(stepMcpIds, stepSkillIds);
    handleDanglingReferences(validationResult, onWarning);
  }

  const mcpServers = mergeStepMcpServers(
    baseConfig.mcpServers,
    workflow.mcpServers,
    stepMcpIds
  );

  const skillsDir = writeStepSkills(
    workingDirectory,
    executionId,
    stepIndex,
    baseConfig.skills,
    workflow.skills,
    stepSkillIds
  );

  const hasSkills = skillsDir !== undefined;

  const allowedTools = buildAllowedTools(
    baseConfig.allowedTools,
    mcpServers,
    hasSkills
  );

  return {
    ...baseConfig,
    ...(step.model && { model: step.model }),
    ...(step.maxTurns && { maxTurns: step.maxTurns }),
    mcpServers,
    allowedTools,
    skillsDir,
    hasSkills
  };
}

// Re-export for convenience
export { writeStepSkills, cleanupStepSkills } from './skillManager';
export { mergeStepMcpServers } from './mcpServerBuilder';
export {
  loadClaudeCliMcpServers,
  loadClaudeCliSkills,
  loadClaudeCliSkillsWithDetails,
  type CliSkillDetail
} from './cliConfigLoader';
