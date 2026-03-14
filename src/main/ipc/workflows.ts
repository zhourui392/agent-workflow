/**
 * 工作流IPC处理器
 *
 * @author zhourui(V33215020)
 * @since 2026/03/11
 */

import { ipcMain } from 'electron';
import { workflowService } from '../services';
import {
  IdSchema,
  CreateWorkflowSchema,
  UpdateWorkflowSchema,
  RunWorkflowInputsSchema,
  validateInput
} from './schemas';

/**
 * 注册工作流相关IPC处理器
 */
export function registerWorkflowHandlers(): void {
  ipcMain.handle('workflows:list', () => {
    return workflowService.list();
  });

  ipcMain.handle('workflows:get', (_, id: unknown) => {
    return workflowService.get(validateInput(IdSchema, id));
  });

  ipcMain.handle('workflows:create', (_, data: unknown) => {
    return workflowService.create(validateInput(CreateWorkflowSchema, data));
  });

  ipcMain.handle('workflows:update', (_, id: unknown, data: unknown) => {
    return workflowService.update(
      validateInput(IdSchema, id),
      validateInput(UpdateWorkflowSchema, data)
    );
  });

  ipcMain.handle('workflows:delete', (_, id: unknown) => {
    return workflowService.remove(validateInput(IdSchema, id));
  });

  ipcMain.handle('workflows:toggle', (_, id: unknown) => {
    return workflowService.toggle(validateInput(IdSchema, id));
  });

  ipcMain.handle('workflows:run', async (_, id: unknown, inputs?: unknown) => {
    return workflowService.run(
      validateInput(IdSchema, id),
      validateInput(RunWorkflowInputsSchema, inputs) || {}
    );
  });
}
