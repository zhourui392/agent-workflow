/**
 * Electron 进度通知器
 *
 * 实现 ProgressNotifier 接口，通过 BrowserWindow IPC 广播执行进度到渲染进程。
 * 创建时缓存当前窗口列表，后续广播自动过滤已销毁窗口。
 *
 * @author zhourui
 * @since 2026/03/14
 */

import { BrowserWindow } from 'electron';
import type { ProgressNotifier } from '../domain/service/PipelineOrchestrator';
import type { ExecutionProgressEvent } from '../domain/model/ExecutionResult';
import type { StepEvent } from '../domain/model/StepEvent';

export class ElectronProgressNotifier implements ProgressNotifier {
  private readonly windows: Electron.BrowserWindow[];

  constructor() {
    this.windows = BrowserWindow.getAllWindows();
  }

  /**
   * 广播进度事件到所有窗口
   */
  broadcast(event: ExecutionProgressEvent): void {
    for (const win of this.windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('execution:progress', event);
      }
    }
  }

  /**
   * 广播步骤开始
   */
  broadcastStepStart(executionId: string, stepIndex: number): void {
    this.broadcast({ executionId, stepIndex, status: 'running' });
  }

  /**
   * 广播流式事件
   */
  broadcastStepEvent(executionId: string, stepIndex: number, event: StepEvent): void {
    this.broadcast({ executionId, stepIndex, status: 'running', event });
  }

  /**
   * 广播步骤完成/失败
   */
  broadcastStepResult(
    executionId: string,
    stepIndex: number,
    success: boolean,
    outputText?: string,
    tokensUsed?: number,
    errorMessage?: string
  ): void {
    this.broadcast({
      executionId,
      stepIndex,
      status: success ? 'success' : 'failed',
      outputText,
      tokensUsed,
      errorMessage
    });
  }
}
