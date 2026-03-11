/**
 * 全局配置IPC处理器
 *
 * @author zhourui(V33215020)
 * @since 2026/03/11
 */

import { ipcMain } from 'electron';
import { configService } from '../services';
import type { McpServerConfig } from '../store/models';

/**
 * 注册全局配置相关IPC处理器
 */
export function registerConfigHandlers(): void {
  ipcMain.handle('config:get', () => {
    return configService.getConfig();
  });

  ipcMain.handle('config:update', (_, data: {
    systemPrompt?: string;
    defaultModel?: string;
    mcpServers?: Record<string, McpServerConfig>;
  }) => {
    configService.updateConfig(data);
    return { success: true };
  });
}
