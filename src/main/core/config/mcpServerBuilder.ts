/**
 * MCP 服务配置构建器
 *
 * @author zhourui(V33215020)
 * @since 2026/03/14
 */

import type { McpServerConfig } from '../../store/models';
import { mcpServerRepository } from '../../store/repositories';

/**
 * 将 McpServer 数据库对象转换为 McpServerConfig
 *
 * @param server MCP 服务数据库对象
 * @returns MCP 服务配置
 */
function buildMcpServerConfig(server: {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}): McpServerConfig {
  return {
    command: server.command,
    args: server.args,
    env: server.env
  };
}

/**
 * 合并步骤的 MCP 配置（按需加载模式）
 *
 * 按需加载策略：
 * - 如果步骤明确引用了 MCP（stepMcpIds 非空），只加载步骤引用的 MCP
 * - 如果步骤没有引用任何 MCP，则合并全局和工作流配置
 *
 * @param diskConfig 磁盘全局配置（~/.claude.json）
 * @param workflowConfig 工作流配置
 * @param stepMcpIds 步骤引用的 MCP ID 列表
 * @returns 合并后的 MCP 配置
 */
export function mergeStepMcpServers(
  diskConfig: Record<string, McpServerConfig> | undefined,
  workflowConfig: Record<string, McpServerConfig> | undefined,
  stepMcpIds: string[] = []
): Record<string, McpServerConfig> {
  const result: Record<string, McpServerConfig> = {};

  if (stepMcpIds.length > 0) {
    const stepServers = mcpServerRepository.findByIds(stepMcpIds);
    for (const server of stepServers) {
      result[server.name] = buildMcpServerConfig(server);
    }
    return result;
  }

  if (diskConfig) {
    Object.assign(result, diskConfig);
  }

  if (workflowConfig) {
    Object.assign(result, workflowConfig);
  }

  return result;
}
