/**
 * MCP 工具目录条目（值对象）
 *
 * 由 MCP server 通过 tools/list 返回的工具描述。
 */

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/**
 * 单个 MCP server 的工具列表结果
 *
 * error 非空表示该 server 枚举失败（降级）—— 前端可展示错误并允许用户手动输入工具名。
 */
export interface McpServerTools {
  server: string;
  tools: McpTool[];
  error?: string;
  fetchedAt: number;
}
