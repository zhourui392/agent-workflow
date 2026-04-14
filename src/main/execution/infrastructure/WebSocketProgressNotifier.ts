/**
 * WebSocket 进度通知器
 *
 * 实现 ProgressNotifier 接口，通过注入的广播回调把执行事件推送给所有
 * 已连接的 WebSocket 客户端。与 ElectronProgressNotifier 行为对齐。
 */

import type { ProgressNotifier } from '../domain/service/PipelineOrchestrator';
import type { ExecutionProgressEvent } from '../domain/model/ExecutionResult';
import type { StepEvent } from '../domain/model/StepEvent';

export type BroadcastFn = (event: ExecutionProgressEvent) => void;

export class WebSocketProgressNotifier implements ProgressNotifier {
  constructor(private readonly broadcastFn: BroadcastFn) {}

  broadcast(event: ExecutionProgressEvent): void {
    try {
      this.broadcastFn(event);
    } catch {
      /* 广播失败不应影响 pipeline */
    }
  }

  broadcastStepStart(executionId: string, stepIndex: number): void {
    this.broadcast({ executionId, stepIndex, status: 'running' });
  }

  broadcastStepEvent(executionId: string, stepIndex: number, event: StepEvent): void {
    this.broadcast({ executionId, stepIndex, status: 'running', event });
  }

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
