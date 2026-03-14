/**
 * 全局配置（值对象）
 */
import type { McpServerConfig } from './McpServerConfig';

export interface GlobalConfig {
  systemPrompt?: string;
  defaultModel?: string;
  mcpServers?: Record<string, McpServerConfig>;
  allowedTools?: string[];
  skills?: Record<string, string>;
}
