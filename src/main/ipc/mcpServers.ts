/**
 * MCP 服务 IPC 处理器
 *
 * @author zhourui(V33215020)
 * @since 2026/03/12
 */

import { ipcMain } from 'electron';
import { mcpServerRepository } from '../store/repositories';
import type { CreateMcpServerInput, UpdateMcpServerInput } from '../store/models';

/**
 * 注册 MCP 服务相关 IPC 处理器
 */
export function registerMcpServerHandlers(): void {
  ipcMain.handle('mcp-servers:list', () => {
    return mcpServerRepository.findAll();
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
