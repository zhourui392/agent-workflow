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
import { executionToDTO } from '../../shared/interface/dtoMapper';
import type { QueryExecutionUseCase } from '../application/QueryExecutionUseCase';
import type { CancelExecutionUseCase } from '../application/CancelExecutionUseCase';

export class ExecutionIpcHandler {
  constructor(
    private readonly queryUseCase: QueryExecutionUseCase,
    private readonly cancelUseCase: CancelExecutionUseCase
  ) {}

  register(): void {
    ipcMain.handle('executions:list', (_, params?: unknown) => {
      return this.queryUseCase.list(validateInput(ExecutionListParamsSchema, params))
        .map(executionToDTO);
    });

    ipcMain.handle('executions:get', (_, id: unknown) => {
      const e = this.queryUseCase.get(validateInput(IdSchema, id));
      return e ? executionToDTO(e) : null;
    });

    ipcMain.handle('executions:cancel', (_, id: unknown) => {
      return this.cancelUseCase.cancel(validateInput(IdSchema, id));
    });

    ipcMain.handle('executions:children', (_, parentId: unknown) => {
      return this.queryUseCase.getChildExecutions(validateInput(IdSchema, parentId))
        .map(executionToDTO);
    });
  }
}
