/**
 * 工作流 IPC 处理器
 */

import { ipcMain } from 'electron';
import {
  IdSchema,
  CreateWorkflowSchema,
  UpdateWorkflowSchema,
  RunWorkflowInputsSchema,
  validateInput
} from '../../shared/interface';
import type { WorkflowApplicationService } from '../application/WorkflowApplicationService';

export class WorkflowIpcHandler {
  constructor(private readonly service: WorkflowApplicationService) {}

  register(): void {
    ipcMain.handle('workflows:list', () => {
      return this.service.list();
    });

    ipcMain.handle('workflows:get', (_, id: unknown) => {
      return this.service.get(validateInput(IdSchema, id));
    });

    ipcMain.handle('workflows:create', (_, data: unknown) => {
      return this.service.create(validateInput(CreateWorkflowSchema, data));
    });

    ipcMain.handle('workflows:update', (_, id: unknown, data: unknown) => {
      return this.service.update(
        validateInput(IdSchema, id),
        validateInput(UpdateWorkflowSchema, data)
      );
    });

    ipcMain.handle('workflows:delete', (_, id: unknown) => {
      return this.service.remove(validateInput(IdSchema, id));
    });

    ipcMain.handle('workflows:toggle', (_, id: unknown) => {
      return this.service.toggle(validateInput(IdSchema, id));
    });

    ipcMain.handle('workflows:run', async (_, id: unknown, inputs?: unknown) => {
      return this.service.run(
        validateInput(IdSchema, id),
        validateInput(RunWorkflowInputsSchema, inputs) || {}
      );
    });
  }
}
