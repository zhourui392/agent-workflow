/**
 * 全局配置IPC处理器
 *
 * @author zhourui(V33215020)
 * @since 2026/03/11
 */

import { ipcMain } from 'electron';
import { configService } from '../services';
import { UpdateConfigSchema, validateInput } from './schemas';
import { invalidateGlobalConfigCache } from '../core/config/globalConfigCache';

/**
 * 注册全局配置相关IPC处理器
 */
export function registerConfigHandlers(): void {
  ipcMain.handle('config:get', () => {
    return configService.getConfig();
  });

  ipcMain.handle('config:update', (_, data: unknown) => {
    configService.updateConfig(validateInput(UpdateConfigSchema, data));
    invalidateGlobalConfigCache();
    return { success: true };
  });
}
