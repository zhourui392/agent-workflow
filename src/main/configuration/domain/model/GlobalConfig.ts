/**
 * 全局配置（值对象）
 */

export interface GlobalConfig {
  systemPrompt?: string;
  defaultModel?: string;
  allowedTools?: string[];
  skills?: Record<string, string>;
}
