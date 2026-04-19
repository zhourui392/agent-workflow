/**
 * MCP 工具目录服务接口
 *
 * 职责：枚举所有已配置 MCP server 暴露的工具列表，带 TTL 缓存和失败降级。
 * 前端步骤编辑器据此渲染"按工具名精细勾选"的多选面板。
 */

import type { McpServerConfig } from '../model/McpServerConfig';
import type { McpServerTools, McpTool } from '../model/McpTool';

/**
 * 单 server 工具枚举端口（基础设施实现）
 *
 * 默认实现用 stdio JSON-RPC 连接 MCP server。
 * 单测时可 mock。
 */
export interface McpToolLister {
  listTools(server: string, config: McpServerConfig, timeoutMs?: number): Promise<McpTool[]>;
}

/**
 * MCP 工具目录应用接口
 */
export interface McpToolCatalog {
  /**
   * 返回所有已配置 MCP server 的工具列表。
   *
   * - forceRefresh=false 时，TTL 内返回缓存
   * - 每个 server 独立 try/catch；单个失败不影响其他 server
   */
  listAll(forceRefresh?: boolean): Promise<Record<string, McpServerTools>>;

  /**
   * 返回指定 server 的工具列表。未知 server 返回 error 非空的结果。
   */
  listByServer(server: string, forceRefresh?: boolean): Promise<McpServerTools>;

  /**
   * 清空缓存（刷新接口）
   */
  invalidate(): void;
}
