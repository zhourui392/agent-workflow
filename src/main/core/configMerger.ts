/**
 * 配置合并器
 *
 * 四层合并策略（按需加载模式）:
 * - 第一层：Claude Code CLI 全局配置（~/.claude.json, ~/.claude/plugins/）
 * - 第二层：应用磁盘全局配置（global_config/）
 * - 第三层：工作流配置（workflow.mcpServers / workflow.skills）
 * - 第四层：步骤引用（step.mcpServerIds / step.skillIds）
 *
 * 数据库配置（mcp_servers / skills 表）作为「配置库」：
 * - enabled 字段仅标记是否可在 UI 中快速选择
 * - 实际加载需在步骤中显式引用（按需加载）
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
import * as os from 'os';
import { app } from 'electron';
import * as yaml from 'yaml';
import log from 'electron-log';
import type {
  GlobalConfig,
  MergedConfig,
  Workflow,
  WorkflowStep,
  McpServerConfig,
  Skill
} from '../store/models';
import { mcpServerRepository, skillRepository } from '../store/repositories';
import { SkillWriteError, type ReferenceValidationResult } from './errors';

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
 * Skill 内容结构
 */
interface SkillContent {
  name: string;
  description?: string;
  allowedTools?: string[];
  content: string;
}

/**
 * 获取应用全局配置目录路径
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
 * 获取 Claude Code CLI 配置文件路径
 *
 * @returns ~/.claude.json 路径
 */
function getClaudeCliConfigPath(): string {
  return path.join(os.homedir(), '.claude.json');
}

/**
 * 获取 Claude Code CLI plugins 目录路径
 *
 * @returns ~/.claude/plugins 路径
 */
function getClaudeCliPluginsPath(): string {
  return path.join(os.homedir(), '.claude', 'plugins');
}

/**
 * Claude CLI 配置文件结构（部分）
 */
interface ClaudeCliConfig {
  mcpServers?: Record<string, McpServerConfig & { type?: string }>;
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
function parseSkillContent(name: string, content: string): SkillContent {
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
 * 读取用户的 Skills 配置
 *
 * 扫描路径: ~/.claude/skills/*.md
 *
 * @returns Skills 配置（name → content），无配置时返回空对象
 */
export function loadClaudeCliSkills(): Record<string, string> {
  const skillsPath = path.join(os.homedir(), '.claude', 'skills');

  if (!fs.existsSync(skillsPath)) {
    return {};
  }

  const result: Record<string, string> = {};

  try {
    const files = fs.readdirSync(skillsPath).filter(f => f.endsWith('.md'));

    for (const file of files) {
      const skillName = path.basename(file, '.md');
      const content = readFileOrNull(path.join(skillsPath, file));
      if (content) {
        result[skillName] = content.trim();
      }
    }
  } catch (error) {
    log.warn('Failed to load skills from ~/.claude/skills', { path: skillsPath, error });
  }

  log.debug('Loaded skills from ~/.claude/skills', { count: Object.keys(result).length });
  return result;
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
 * 将 McpServer 数据库对象转换为 McpServerConfig
 *
 * @param server MCP 服务数据库对象
 * @returns MCP 服务配置
 */
function buildMcpServerConfig(server: {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}): McpServerConfig {
  return {
    command: server.command,
    args: server.args,
    env: server.env
  };
}

/**
 * 合并步骤的 MCP 配置（按需加载模式）
 *
 * 合并优先级（从低到高）：
 * 1. 磁盘全局配置
 * 2. 工作流配置
 * 3. 步骤引用的数据库配置
 *
 * 数据库 enabled 字段仅用于 UI 快速选择，不影响实际加载。
 *
 * @param diskConfig 磁盘全局配置
 * @param workflowConfig 工作流配置
 * @param stepMcpIds 步骤引用的 MCP ID 列表
 * @returns 合并后的 MCP 配置
 */
export function mergeStepMcpServers(
  diskConfig: Record<string, McpServerConfig> | undefined,
  workflowConfig: Record<string, McpServerConfig> | undefined,
  stepMcpIds: string[] = []
): Record<string, McpServerConfig> {
  const result: Record<string, McpServerConfig> = {};

  if (diskConfig) {
    Object.assign(result, diskConfig);
  }

  if (workflowConfig) {
    Object.assign(result, workflowConfig);
  }

  if (stepMcpIds.length > 0) {
    const stepServers = mcpServerRepository.findByIds(stepMcpIds);
    for (const server of stepServers) {
      result[server.name] = buildMcpServerConfig(server);
    }
  }

  return result;
}

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
 * 数据库 enabled 字段仅用于 UI 快速选择，不影响实际加载。
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
