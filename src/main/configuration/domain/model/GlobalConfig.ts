/**
 * 全局配置（值对象）
 */

import type { McpServerConfig } from './McpServerConfig';

export interface GlobalConfig {
  systemPrompt?: string;
  defaultModel?: string;
  allowedTools?: string[];
  skills?: Record<string, string>;
  mcpServers?: Record<string, McpServerConfig>;
}
