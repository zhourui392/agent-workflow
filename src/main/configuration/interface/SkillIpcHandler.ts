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
import { skillToDTO } from '../../shared/interface/dtoMapper';
import { Skill } from '../domain/model';
import type { SkillApplicationService } from '../application/SkillApplicationService';

export class SkillIpcHandler {
  constructor(private readonly service: SkillApplicationService) {}

  register(): void {
    ipcMain.handle('skills:list', () => {
      return this.service.list().map(skillToDTO);
    });

    ipcMain.handle('skills:list-all', () => {
      return this.service.listAll().map(item =>
        item instanceof Skill ? skillToDTO(item) : item
      );
    });

    ipcMain.handle('skills:get', (_, id: unknown) => {
      const s = this.service.get(validateInput(IdSchema, id));
      return s ? skillToDTO(s) : null;
    });

    ipcMain.handle('skills:create', (_, data: unknown) => {
      return skillToDTO(this.service.create(validateInput(CreateSkillSchema, data)));
    });

    ipcMain.handle('skills:update', (_, id: unknown, data: unknown) => {
      const s = this.service.update(
        validateInput(IdSchema, id),
        validateInput(UpdateSkillSchema, data)
      );
      return s ? skillToDTO(s) : null;
    });

    ipcMain.handle('skills:delete', (_, id: unknown) => {
      return this.service.remove(validateInput(IdSchema, id));
    });

    ipcMain.handle('skills:set-enabled', (_, id: unknown, enabled: unknown) => {
      const s = this.service.setEnabled(
        validateInput(IdSchema, id),
        validateInput(z.boolean(), enabled)
      );
      return s ? skillToDTO(s) : null;
    });
  }
}
