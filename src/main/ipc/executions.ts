/**
 * 执行记录IPC处理器
 *
 * @author zhourui(V33215020)
 * @since 2026/03/11
 */

import { ipcMain } from 'electron';
import { executionService } from '../services';
import { IdSchema, ExecutionListParamsSchema, validateInput } from './schemas';

/**
 * 注册执行记录相关IPC处理器
 */
export function registerExecutionHandlers(): void {
  ipcMain.handle('executions:list', (_, params?: unknown) => {
    return executionService.list(validateInput(ExecutionListParamsSchema, params));
  });

  ipcMain.handle('executions:get', (_, id: unknown) => {
    return executionService.get(validateInput(IdSchema, id));
  });
}
