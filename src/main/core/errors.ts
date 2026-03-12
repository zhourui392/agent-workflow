/**
 * 自定义错误类型
 *
 * @author zhourui(V33215020)
 * @since 2026/03/12
 */

/**
 * Skill 文件写入错误
 *
 * 当 Skills 目录创建或文件写入失败时抛出
 */
export class SkillWriteError extends Error {
  readonly skillName: string;

  constructor(message: string, skillName: string) {
    super(message);
    this.name = 'SkillWriteError';
    this.skillName = skillName;
  }
}

/**
 * 配置引用错误
 *
 * 当配置引用的 ID 不存在时使用（警告级别，不阻断执行）
 */
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

/**
 * MCP 服务启动结果
 */
export interface McpServerStartResult {
  name: string;
  status: 'connected' | 'failed' | 'timeout';
  error?: string;
}

/**
 * 配置引用校验结果
 */
export interface ReferenceValidationResult {
  valid: boolean;
  missingMcpIds: string[];
  missingSkillIds: string[];
}
