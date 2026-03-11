/**
 * 工作流IPC处理器
 *
 * @author zhourui(V33215020)
 * @since 2026/03/11
 */

import { ipcMain } from 'electron';
import { workflowService } from '../services';
import type { CreateWorkflowRequest, UpdateWorkflowRequest } from '../store/models';

/**
 * 注册工作流相关IPC处理器
 */
export function registerWorkflowHandlers(): void {
  ipcMain.handle('workflows:list', () => {
    return workflowService.list();
  });

  ipcMain.handle('workflows:get', (_, id: string) => {
    return workflowService.get(id);
  });

  ipcMain.handle('workflows:create', (_, data: CreateWorkflowRequest) => {
    return workflowService.create(data);
  });

  ipcMain.handle('workflows:update', (_, id: string, data: UpdateWorkflowRequest) => {
    return workflowService.update(id, data);
  });

  ipcMain.handle('workflows:delete', (_, id: string) => {
    return workflowService.remove(id);
  });

  ipcMain.handle('workflows:toggle', (_, id: string) => {
    return workflowService.toggle(id);
  });

  ipcMain.handle('workflows:run', async (_, id: string, inputs?: Record<string, unknown>) => {
    return workflowService.run(id, inputs || {});
  });
}
