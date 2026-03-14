/**
 * 执行进度广播器
 *
 * 封装 BrowserWindow 广播逻辑，缓存窗口引用避免高频查询
 *
 * @author zhourui(V33215020)
 * @since 2026/03/14
 */

import { BrowserWindow } from 'electron';
import type { ExecutionProgressEvent, StepEvent } from '../../store/models';

/**
 * 进度广播器
 *
 * 创建时缓存当前窗口列表，后续广播自动过滤已销毁窗口
 */
export class ProgressBroadcaster {
  private readonly windows: Electron.BrowserWindow[];

  constructor() {
    this.windows = BrowserWindow.getAllWindows();
  }

  /**
   * 广播进度事件到所有窗口
   *
   * @param event 进度事件
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
