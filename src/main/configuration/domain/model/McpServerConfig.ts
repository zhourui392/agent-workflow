/**
 * MCP 服务器连接配置（值对象）
 */
export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}
