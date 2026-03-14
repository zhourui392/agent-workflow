/**
 * 配置领域错误类型
 */

export class SkillWriteError extends Error {
  readonly skillName: string;

  constructor(message: string, skillName: string) {
    super(message);
    this.name = 'SkillWriteError';
    this.skillName = skillName;
  }
}

export class ConfigReferenceError extends Error {
  readonly missingMcpIds: string[];
  readonly missingSkillIds: string[];

  constructor(missingMcpIds: string[], missingSkillIds: string[]) {
    const parts: string[] = [];
    if (missingMcpIds.length > 0) {
      parts.push(`MCP IDs: ${missingMcpIds.join(', ')}`);
    }
    if (missingSkillIds.length > 0) {
      parts.push(`Skill IDs: ${missingSkillIds.join(', ')}`);
    }
    super(`配置引用不存在: ${parts.join('; ')}`);
    this.name = 'ConfigReferenceError';
    this.missingMcpIds = missingMcpIds;
    this.missingSkillIds = missingSkillIds;
  }
}

export interface ReferenceValidationResult {
  valid: boolean;
  missingMcpIds: string[];
  missingSkillIds: string[];
}

export interface McpServerStartResult {
  name: string;
  status: 'connected' | 'failed' | 'timeout';
  error?: string;
}
