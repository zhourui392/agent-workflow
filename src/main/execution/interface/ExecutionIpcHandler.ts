/**
 * 执行记录 IPC 处理器
 *
 * 接口层：负责协议适配、参数校验，委托应用层用例处理业务。
 *
 * @author zhourui
 * @since 2026/03/14
 */

import { ipcMain } from 'electron';
import { IdSchema, ExecutionListParamsSchema, validateInput } from '../../shared/interface';
import type { QueryExecutionUseCase } from '../application/QueryExecutionUseCase';

export class ExecutionIpcHandler {
  constructor(private readonly queryUseCase: QueryExecutionUseCase) {}

  register(): void {
    ipcMain.handle('executions:list', (_, params?: unknown) => {
      return this.queryUseCase.list(validateInput(ExecutionListParamsSchema, params));
    });

    ipcMain.handle('executions:get', (_, id: unknown) => {
      return this.queryUseCase.get(validateInput(IdSchema, id));
    });
  }
}
