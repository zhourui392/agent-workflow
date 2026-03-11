/**
 * 执行记录IPC处理器
 *
 * @author zhourui(V33215020)
 * @since 2026/03/11
 */

import { ipcMain } from 'electron';
import { executionService } from '../services';
import type { ExecutionListParams } from '../store/models';

/**
 * 注册执行记录相关IPC处理器
 */
export function registerExecutionHandlers(): void {
  ipcMain.handle('executions:list', (_, params?: ExecutionListParams) => {
    return executionService.list(params);
  });

  ipcMain.handle('executions:get', (_, id: string) => {
    return executionService.get(id);
  });
}
