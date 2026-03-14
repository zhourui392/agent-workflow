/**
 * 全局配置 IPC 处理器
 */

import { ipcMain } from 'electron';
import { UpdateConfigSchema, validateInput } from '../../shared/interface';
import type { GlobalConfigApplicationService } from '../application/GlobalConfigApplicationService';

export class ConfigIpcHandler {
  constructor(private readonly service: GlobalConfigApplicationService) {}

  register(): void {
    ipcMain.handle('config:get', () => {
      return this.service.getConfig();
    });

    ipcMain.handle('config:update', (_, data: unknown) => {
      this.service.updateConfig(validateInput(UpdateConfigSchema, data));
      return { success: true };
    });
  }
}
