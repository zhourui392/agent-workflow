/**
 * Skills IPC 处理器
 *
 * @author zhourui(V33215020)
 * @since 2026/03/12
 */

import { ipcMain } from 'electron';
import { skillRepository } from '../store/repositories';
import type { CreateSkillInput, UpdateSkillInput } from '../store/models';

/**
 * 注册 Skills 相关 IPC 处理器
 */
export function registerSkillHandlers(): void {
  ipcMain.handle('skills:list', () => {
    return skillRepository.findAll();
  });

  ipcMain.handle('skills:get', (_, id: string) => {
    return skillRepository.findById(id);
  });

  ipcMain.handle('skills:create', (_, data: CreateSkillInput) => {
    return skillRepository.create(data);
  });

  ipcMain.handle('skills:update', (_, id: string, data: UpdateSkillInput) => {
    return skillRepository.update(id, data);
  });

  ipcMain.handle('skills:delete', (_, id: string) => {
    return skillRepository.remove(id);
  });

  ipcMain.handle('skills:set-enabled', (_, id: string, enabled: boolean) => {
    return skillRepository.setEnabled(id, enabled);
  });
}
