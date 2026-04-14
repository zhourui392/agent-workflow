/**
 * WebSocket 客户端：订阅执行进度事件
 *
 * 取代原 Electron IPC 的 `window.api.onExecutionProgress`。
 * 页面首次订阅时自动建立连接；连接断开后 3 秒自动重连。
 */

import type { ExecutionProgressEvent } from '../../main/types';

type Listener = (event: ExecutionProgressEvent) => void;

const listeners = new Set<Listener>();
let ws: WebSocket | null = null;
let reconnectTimer: number | null = null;

function wsUrl(): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/ws/executions`;
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
    let event: ExecutionProgressEvent;
    try {
      event = JSON.parse(String(e.data));
    } catch {
      return;
    }
    for (const cb of listeners) {
      try { cb(event); } catch { /* swallow listener errors */ }
    }
  };

  ws.onclose = () => { scheduleReconnect(); };
  ws.onerror = () => { ws?.close(); };
}

function scheduleReconnect(): void {
  if (reconnectTimer !== null) return;
  if (listeners.size === 0) return;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 3000);
}

export function subscribeExecutionProgress(callback: Listener): () => void {
  listeners.add(callback);
  connect();
  return () => {
    listeners.delete(callback);
    if (listeners.size === 0 && ws) {
      ws.close();
      ws = null;
    }
  };
}
