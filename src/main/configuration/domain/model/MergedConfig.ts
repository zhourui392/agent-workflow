/**
 * 合并后的配置（值对象）
 */

export interface MergedConfig {
  systemPrompt?: string;
  model?: string;
  allowedTools?: string[];
  skills?: Record<string, string>;
  maxTurns?: number;
  timeoutMs?: number;
  workingDirectory?: string;
}

/**
 * 步骤级合并配置（值对象）
 */
export interface StepMergedConfig extends MergedConfig {
  skillsDir?: string;
  hasSkills: boolean;
}
