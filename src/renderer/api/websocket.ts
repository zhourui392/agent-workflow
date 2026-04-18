/**
 * WebSocket 客户端：订阅执行进度 + Skill 生成事件
 *
 * `/ws/executions` 是一个共享通道；消息通过 `kind` 字段区分通道：
 * - 无 `kind`（或 `kind === 'execution'`）：执行进度事件
 * - `kind === 'skill-generation'`：Skill 生成/验证会话事件
 *
 * 页面首次订阅时自动建立连接；连接断开后 3 秒自动重连。
 */

import type { ExecutionProgressEvent } from '../../main/types';

export interface SkillGenerationEvent {
  kind: 'skill-generation';
  generationId: string;
  phase: 'generating' | 'verifying';
  type: 'start' | 'step' | 'generation_done' | 'verification_done' | 'error';
  stepEvent?: unknown;
  payload?: Record<string, unknown>;
  errorMessage?: string;
}

type ExecutionListener = (event: ExecutionProgressEvent) => void;
type SkillGenerationListener = (event: SkillGenerationEvent) => void;

const executionListeners = new Set<ExecutionListener>();
const skillGenListeners = new Set<SkillGenerationListener>();
let ws: WebSocket | null = null;
let reconnectTimer: number | null = null;

function wsUrl(): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/ws/executions`;
}

function totalListeners(): number {
  return executionListeners.size + skillGenListeners.size;
}

function connect(): void {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    ws = new WebSocket(wsUrl());
  } catch (err) {
    scheduleReconnect();
    return;
  }

  ws.onmessage = (e: MessageEvent) => {
    let event: { kind?: string } & Record<string, unknown>;
    try {
      event = JSON.parse(String(e.data));
    } catch {
      return;
    }

    if (event.kind === 'skill-generation') {
      for (const cb of skillGenListeners) {
        try { cb(event as unknown as SkillGenerationEvent); } catch { /* swallow */ }
      }
      return;
    }

    for (const cb of executionListeners) {
      try { cb(event as unknown as ExecutionProgressEvent); } catch { /* swallow */ }
    }
  };

  ws.onclose = () => { scheduleReconnect(); };
  ws.onerror = () => { ws?.close(); };
}

function scheduleReconnect(): void {
  if (reconnectTimer !== null) return;
  if (totalListeners() === 0) return;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 3000);
}

function maybeClose(): void {
  if (totalListeners() === 0 && ws) {
    ws.close();
    ws = null;
  }
}

export function subscribeExecutionProgress(callback: ExecutionListener): () => void {
  executionListeners.add(callback);
  connect();
  return () => {
    executionListeners.delete(callback);
    maybeClose();
  };
}

export function subscribeSkillGeneration(callback: SkillGenerationListener): () => void {
  skillGenListeners.add(callback);
  connect();
  return () => {
    skillGenListeners.delete(callback);
    maybeClose();
  };
}
