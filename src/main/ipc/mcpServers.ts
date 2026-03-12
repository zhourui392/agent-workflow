/**
 * MCP 服务 IPC 处理器
 *
 * @author zhourui(V33215020)
 * @since 2026/03/12
 */

import { ipcMain } from 'electron';
import { mcpServerRepository } from '../store/repositories';
import { loadClaudeCliMcpServers } from '../core';
import type { CreateMcpServerInput, UpdateMcpServerInput, McpServer } from '../store/models';

/**
 * CLI MCP 配置项（用于前端显示）
 */
interface CliMcpServer {
  id: string;
  name: string;
  description: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;
  source: 'cli';
  createdAt: string;
  updatedAt: string;
}

/**
 * 注册 MCP 服务相关 IPC 处理器
 */
export function registerMcpServerHandlers(): void {
  ipcMain.handle('mcp-servers:list', () => {
    return mcpServerRepository.findAll();
  });

  ipcMain.handle('mcp-servers:list-all', () => {
    const dbServers = mcpServerRepository.findAll();
    const cliServers = loadClaudeCliMcpServers();

    const result: (McpServer | CliMcpServer)[] = [...dbServers];

    const dbNames = new Set(dbServers.map(s => s.name));
    const now = new Date().toISOString();

    for (const [name, config] of Object.entries(cliServers)) {
      if (!dbNames.has(name)) {
        result.push({
          id: `cli:${name}`,
          name,
          description: 'Claude Code CLI 全局配置',
          command: config.command,
          args: config.args,
          env: config.env,
          enabled: true,
          source: 'cli',
          createdAt: now,
          updatedAt: now
        });
      }
    }

    return result;
  });

  ipcMain.handle('mcp-servers:get', (_, id: string) => {
    return mcpServerRepository.findById(id);
  });

  ipcMain.handle('mcp-servers:create', (_, data: CreateMcpServerInput) => {
    return mcpServerRepository.create(data);
  });

  ipcMain.handle('mcp-servers:update', (_, id: string, data: UpdateMcpServerInput) => {
    return mcpServerRepository.update(id, data);
  });

  ipcMain.handle('mcp-servers:delete', (_, id: string) => {
    return mcpServerRepository.remove(id);
  });

  ipcMain.handle('mcp-servers:set-enabled', (_, id: string, enabled: boolean) => {
    return mcpServerRepository.setEnabled(id, enabled);
  });
}
