/**
 * Chat API 客户端
 *
 * REST 部分使用 axios；流式消息直接用原生 EventSource。
 */

import axios from 'axios';

export type AgentType = 'claude' | 'codex';

export interface ChatMessageDTO {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface ChatSessionDTO {
  id: string;
  agentType: AgentType;
  workingDir: string;
  createdAt: string;
  resumeId: string | null;
  title: string | null;
  messages: ChatMessageDTO[];
}

export interface ChatSessionSummary {
  id: string;
  agentType: AgentType;
  workingDir: string;
  createdAt: string;
  title: string | null;
  messageCount: number;
}

const http = axios.create({ timeout: 60_000 });

export function createSession(agentType: AgentType, workingDir: string): Promise<{ data: ChatSessionDTO }> {
  return http.post<ChatSessionDTO>('/api/chat/sessions', { agentType, workingDir });
}

export function listSessions(): Promise<{ data: ChatSessionSummary[] }> {
  return http.get<ChatSessionSummary[]>('/api/chat/sessions');
}

export function getSession(id: string): Promise<{ data: ChatSessionDTO }> {
  return http.get<ChatSessionDTO>(`/api/chat/sessions/${encodeURIComponent(id)}`);
}

export function deleteSession(id: string): Promise<{ data: { success: boolean } }> {
  return http.delete<{ success: boolean }>(`/api/chat/sessions/${encodeURIComponent(id)}`);
}

export function stopSession(id: string): Promise<{ data: { success: boolean } }> {
  return http.post<{ success: boolean }>(`/api/chat/sessions/${encodeURIComponent(id)}/stop`);
}

export interface StreamHandlers {
  onChunk: (chunk: string) => void;
  onExit: (code: number) => void;
  onError?: (err: Error) => void;
}

/**
 * 订阅 SSE 流；返回一个 close 函数用于主动终止。
 */
export function streamMessage(
  sessionId: string,
  message: string,
  env: string | undefined,
  handlers: StreamHandlers
): () => void {
  const params = new URLSearchParams({ message });
  if (env) params.set('env', env);
  const url = `/api/chat/sessions/${encodeURIComponent(sessionId)}/stream?${params.toString()}`;
  const es = new EventSource(url);
  es.addEventListener('chunk', (ev: MessageEvent) => handlers.onChunk(String(ev.data)));
  es.addEventListener('exit', (ev: MessageEvent) => {
    handlers.onExit(Number(ev.data));
    es.close();
  });
  es.addEventListener('error', () => {
    handlers.onError?.(new Error('SSE connection error'));
    es.close();
  });
  return () => es.close();
}
