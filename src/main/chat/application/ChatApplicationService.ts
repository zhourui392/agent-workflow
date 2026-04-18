/**
 * Chat 应用服务
 *
 * 编排会话创建、消息流式执行、停止执行。运行时：
 * - 创建会话时持久化空 session
 * - 发送消息前写入 user 消息
 * - 流式接收 chunk：转发给回调、累积到 assistantBuffer、从 JSON 行抽取 resumeId
 * - 进程退出后把 assistantBuffer 以 assistant 角色写回持久层
 */

import { randomUUID } from 'crypto';
import { ChatSession } from '../domain/model/ChatSession';
import type { AgentType } from '../domain/model/AgentType';
import type { SessionRepository, SessionSummary } from '../domain/repository/SessionRepository';
import type { AgentGateway } from '../domain/service/AgentGateway';

export interface StreamCallbacks {
  onChunk: (chunk: string) => void;
  onExit: (code: number) => void;
  onError?: (error: Error) => void;
}

/**
 * 尝试从一行输出中抽取 resumeId：如果是合法 JSON 且包含 session_id 字段则返回。
 * 同时兼容顶层 `session_id` 和嵌套 `.init.session_id`（Claude stream-json 格式）。
 */
export function extractResumeIdFromChunk(line: string): string | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.session_id === 'string' && obj.session_id.trim() !== '') {
    return obj.session_id;
  }
  if (typeof obj.sessionId === 'string' && obj.sessionId.trim() !== '') {
    return obj.sessionId;
  }
  return undefined;
}

export class ChatApplicationService {
  constructor(
    private readonly sessionRepo: SessionRepository,
    private readonly agentGateway: AgentGateway
  ) {}

  startSession(agentType: AgentType, workingDir: string): ChatSession {
    const session = ChatSession.create(agentType, workingDir);
    this.sessionRepo.save(session);
    return session;
  }

  getSession(id: string): ChatSession | null {
    return this.sessionRepo.find(id);
  }

  listSessions(limit?: number, offset?: number): SessionSummary[] {
    return this.sessionRepo.listSummaries(limit, offset);
  }

  deleteSession(id: string): boolean {
    this.agentGateway.stopStream(id);
    return this.sessionRepo.remove(id);
  }

  /**
   * 异步流式发送消息。该方法立即返回；输出通过 callbacks 推送。
   */
  streamMessage(
    sessionId: string,
    message: string,
    env: string | undefined,
    callbacks: StreamCallbacks
  ): void {
    const session = this.sessionRepo.find(sessionId);
    if (!session) {
      callbacks.onError?.(new Error(`Session not found: ${sessionId}`));
      callbacks.onExit(-1);
      return;
    }

    // 持久化用户消息
    this.sessionRepo.addMessage(sessionId, 'user', message);

    const assistantBuffer: string[] = [];
    let detectedResumeId: string | undefined;

    this.agentGateway.runStream({
      sessionId,
      agentType: session.agentType,
      workingDir: session.workingDir,
      message,
      resumeId: session.resumeId,
      env,
      onChunk: (chunk: string) => {
        assistantBuffer.push(chunk);
        if (!detectedResumeId) {
          const id = extractResumeIdFromChunk(chunk);
          if (id) {
            detectedResumeId = id;
            this.sessionRepo.updateResumeId(sessionId, id);
          }
        }
        callbacks.onChunk(chunk);
      },
      onExit: (code: number) => {
        const full = assistantBuffer.join('\n');
        if (full.trim() !== '') {
          this.sessionRepo.addMessage(sessionId, 'assistant', full);
        }
        callbacks.onExit(code);
      },
      onError: callbacks.onError
    });
  }

  stopSession(sessionId: string): boolean {
    return this.agentGateway.stopStream(sessionId);
  }

  isRunning(sessionId: string): boolean {
    return this.agentGateway.isRunning(sessionId);
  }

  /**
   * 为会话生成或返回已有的分享 token（幂等）。
   * token 使用 16 字符无连字符 UUID，与 agent-web 一致。
   */
  shareSession(sessionId: string): string | null {
    const candidate = randomUUID().replace(/-/g, '').slice(0, 16);
    return this.sessionRepo.setShareToken(sessionId, candidate);
  }

  getSharedSession(token: string): ChatSession | null {
    return this.sessionRepo.findByShareToken(token);
  }
}
