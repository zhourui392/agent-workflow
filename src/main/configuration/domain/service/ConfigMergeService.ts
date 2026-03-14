/**
 * 配置合并领域服务
 *
 * 四层合并策略:
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
 */

import log from 'electron-log';
import type { McpServerConfig } from '../model/McpServerConfig';
import type { GlobalConfig } from '../model/GlobalConfig';
import type { MergedConfig, StepMergedConfig } from '../model/MergedConfig';
import type { ReferenceValidationResult } from '../model/ConfigErrors';
import type { McpServerRepository } from '../repository/McpServerRepository';
import type { SkillRepository } from '../repository/SkillRepository';

/**
 * Skill 内容结构（用于文件写入）
 */
export interface SkillContent {
  name: string;
  description?: string;
  allowedTools?: string[];
  content: string;
}

/**
 * 全局配置加载器接口（基础设施注入）
 */
export interface GlobalConfigProvider {
  loadCliMcpServers(): Record<string, McpServerConfig>;
  loadCliSkills(): Record<string, string>;
  loadDiskConfig(): GlobalConfig;
}

/**
 * Skill 文件写入器接口（基础设施注入）
 */
export interface SkillFileWriter {
  writeStepSkills(
    workingDirectory: string,
    executionId: string,
    stepIndex: number,
    skills: Map<string, SkillContent>
  ): string | undefined;

  cleanupStepSkills(skillsDir: string): void;
}

/**
 * 工作流配置接口（跨上下文引用，避免循环依赖）
 */
export interface WorkflowConfigRef {
  rules?: string;
  mcpServers?: Record<string, McpServerConfig>;
  skills?: Record<string, string>;
  limits?: { maxTurns?: number; timeoutMs?: number };
  workingDirectory?: string;
}

/**
 * 步骤配置接口（跨上下文引用）
 */
export interface StepConfigRef {
  model?: string;
  maxTurns?: number;
  mcpServerIds?: string[];
  skillIds?: string[];
}

export class ConfigMergeService {
  constructor(
    private readonly mcpServerRepo: McpServerRepository,
    private readonly skillRepo: SkillRepository,
    private readonly globalConfigProvider: GlobalConfigProvider,
    private readonly skillFileWriter: SkillFileWriter
  ) {}

  /**
   * 加载全局配置（第一层 CLI + 第二层磁盘）
   */
  loadGlobalConfig(): GlobalConfig {
    const config: GlobalConfig = {};

    const cliMcpServers = this.globalConfigProvider.loadCliMcpServers();
    if (Object.keys(cliMcpServers).length > 0) {
      config.mcpServers = cliMcpServers;
    }

    const cliSkills = this.globalConfigProvider.loadCliSkills();
    if (Object.keys(cliSkills).length > 0) {
      config.skills = cliSkills;
    }

    const diskConfig = this.globalConfigProvider.loadDiskConfig();

    if (diskConfig.systemPrompt) {
      config.systemPrompt = diskConfig.systemPrompt;
    }
    if (diskConfig.defaultModel) {
      config.defaultModel = diskConfig.defaultModel;
    }
    if (diskConfig.allowedTools) {
      config.allowedTools = diskConfig.allowedTools;
    }
    if (diskConfig.mcpServers) {
      config.mcpServers = { ...config.mcpServers, ...diskConfig.mcpServers };
    }
    if (diskConfig.skills) {
      if (!config.skills) config.skills = {};
      Object.assign(config.skills, diskConfig.skills);
    }

    return config;
  }

  /**
   * 合并全局配置与工作流配置（第一到第三层）
   */
  mergeWorkflowConfig(globalConfig: GlobalConfig, workflow: WorkflowConfigRef): MergedConfig {
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
   * 为步骤构建完整的合并配置（第一到第四层）
   */
  buildStepMergedConfig(
    baseConfig: MergedConfig,
    workflow: WorkflowConfigRef,
    step: StepConfigRef,
    executionId: string,
    stepIndex: number,
    onWarning?: (message: string) => void
  ): StepMergedConfig {
    const workingDirectory = baseConfig.workingDirectory || process.cwd();
    const stepMcpIds = step.mcpServerIds || [];
    const stepSkillIds = step.skillIds || [];

    if (stepMcpIds.length > 0 || stepSkillIds.length > 0) {
      const validationResult = this.validateConfigReferences(stepMcpIds, stepSkillIds);
      this.handleDanglingReferences(validationResult, onWarning);
    }

    const mcpServers = this.mergeStepMcpServers(
      baseConfig.mcpServers,
      workflow.mcpServers,
      stepMcpIds
    );

    const mergedSkills = this.collectStepSkills(
      baseConfig.skills,
      workflow.skills,
      stepSkillIds
    );

    const skillsDir = this.skillFileWriter.writeStepSkills(
      workingDirectory,
      executionId,
      stepIndex,
      mergedSkills
    );

    const hasSkills = skillsDir !== undefined;

    const allowedTools = this.buildAllowedTools(
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

  /**
   * 清理步骤 Skills 隔离目录
   */
  cleanupStepSkills(skillsDir: string): void {
    this.skillFileWriter.cleanupStepSkills(skillsDir);
  }

  /**
   * 校验配置引用有效性
   */
  validateConfigReferences(
    mcpServerIds: string[],
    skillIds: string[]
  ): ReferenceValidationResult {
    const missingMcpIds: string[] = [];
    const missingSkillIds: string[] = [];

    if (mcpServerIds.length > 0) {
      const foundServers = this.mcpServerRepo.findByIds(mcpServerIds);
      const foundIds = new Set(foundServers.map(s => s.id));
      for (const id of mcpServerIds) {
        if (!foundIds.has(id)) {
          missingMcpIds.push(id);
        }
      }
    }

    if (skillIds.length > 0) {
      const foundSkills = this.skillRepo.findByIds(skillIds);
      const foundIds = new Set(foundSkills.map(s => s.id));
      for (const id of skillIds) {
        if (!foundIds.has(id)) {
          missingSkillIds.push(id);
        }
      }
    }

    return { valid: missingMcpIds.length === 0 && missingSkillIds.length === 0, missingMcpIds, missingSkillIds };
  }

  /**
   * 生成步骤的 allowedTools 列表
   */
  buildAllowedTools(
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

  handleDanglingReferences(
    result: ReferenceValidationResult,
    onWarning?: (message: string) => void
  ): void {
    if (result.valid) return;

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

  private mergeStepMcpServers(
    diskConfig: Record<string, McpServerConfig> | undefined,
    workflowConfig: Record<string, McpServerConfig> | undefined,
    stepMcpIds: string[]
  ): Record<string, McpServerConfig> {
    const result: Record<string, McpServerConfig> = {};

    if (stepMcpIds.length > 0) {
      const stepServers = this.mcpServerRepo.findByIds(stepMcpIds);
      for (const server of stepServers) {
        result[server.name] = server.toConfig();
      }
      return result;
    }

    if (diskConfig) {
      Object.assign(result, diskConfig);
    }
    if (workflowConfig) {
      Object.assign(result, workflowConfig);
    }

    return result;
  }

  private collectStepSkills(
    diskSkills: Record<string, string> | undefined,
    workflowSkills: Record<string, string> | undefined,
    stepSkillIds: string[]
  ): Map<string, SkillContent> {
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
      const stepSkills = this.skillRepo.findByIds(stepSkillIds);
      for (const skill of stepSkills) {
        mergedSkills.set(skill.name, {
          name: skill.name,
          description: skill.description,
          allowedTools: skill.allowedTools,
          content: skill.content
        });
      }
    }

    return mergedSkills;
  }
}
