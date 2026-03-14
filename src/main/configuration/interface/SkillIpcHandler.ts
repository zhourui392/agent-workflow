/**
 * Skills IPC 处理器
 */

import { ipcMain } from 'electron';
import { z } from 'zod';
import {
  IdSchema,
  CreateSkillSchema,
  UpdateSkillSchema,
  validateInput
} from '../../shared/interface';
import type { SkillApplicationService } from '../application/SkillApplicationService';

export class SkillIpcHandler {
  constructor(private readonly service: SkillApplicationService) {}

  register(): void {
    ipcMain.handle('skills:list', () => {
      return this.service.list();
    });

    ipcMain.handle('skills:list-all', () => {
      return this.service.listAll();
    });

    ipcMain.handle('skills:get', (_, id: unknown) => {
      return this.service.get(validateInput(IdSchema, id));
    });

    ipcMain.handle('skills:create', (_, data: unknown) => {
      return this.service.create(validateInput(CreateSkillSchema, data));
    });

    ipcMain.handle('skills:update', (_, id: unknown, data: unknown) => {
      return this.service.update(
        validateInput(IdSchema, id),
        validateInput(UpdateSkillSchema, data)
      );
    });

    ipcMain.handle('skills:delete', (_, id: unknown) => {
      return this.service.remove(validateInput(IdSchema, id));
    });

    ipcMain.handle('skills:set-enabled', (_, id: unknown, enabled: unknown) => {
      return this.service.setEnabled(
        validateInput(IdSchema, id),
        validateInput(z.boolean(), enabled)
      );
    });
  }
}
