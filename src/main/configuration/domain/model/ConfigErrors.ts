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
  readonly missingSkillIds: string[];

  constructor(missingSkillIds: string[]) {
    super(`配置引用不存在: Skill IDs: ${missingSkillIds.join(', ')}`);
    this.name = 'ConfigReferenceError';
    this.missingSkillIds = missingSkillIds;
  }
}

export interface ReferenceValidationResult {
  valid: boolean;
  missingSkillIds: string[];
}
