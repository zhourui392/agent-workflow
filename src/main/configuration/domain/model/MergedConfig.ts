/**
 * 合并后的配置（值对象）
 */
import type { McpServerConfig } from './McpServerConfig';

export interface MergedConfig {
  systemPrompt?: string;
  model?: string;
  allowedTools?: string[];
  mcpServers?: Record<string, McpServerConfig>;
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
