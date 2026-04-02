/**
 * MCP Server 配置（值对象）
 *
 * 对应 Claude Agent SDK 的 mcpServers 选项中的单个服务器配置。
 * 支持 stdio 类型（command + args + env）。
 */

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}
