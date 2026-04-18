/**
 * 内存会话仓库（用于测试和简单场景）
 */

import { ChatSession } from '../domain/model/ChatSession';
import type { SessionRepository, SessionSummary } from '../domain/repository/SessionRepository';

export class InMemorySessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, ChatSession>();

  save(session: ChatSession): void {
    this.sessions.set(session.id, session);
  }

  find(id: string): ChatSession | null {
    return this.sessions.get(id) ?? null;
  }

  remove(id: string): boolean {
    return this.sessions.delete(id);
  }

  updateResumeId(id: string, resumeId: string): void {
    this.sessions.get(id)?.updateResumeId(resumeId);
  }

  addMessage(id: string, role: 'user' | 'assistant' | 'system', content: string): void {
    this.sessions.get(id)?.addMessage(role, content);
  }

  setShareToken(id: string, token: string): string | null {
    const session = this.sessions.get(id);
    if (!session) return null;
    if (session.shareToken && session.shareToken.trim() !== '') return session.shareToken;
    session.setShareToken(token);
    return session.shareToken ?? null;
  }

  findByShareToken(token: string): ChatSession | null {
    if (!token || token.trim() === '') return null;
    const t = token.trim();
    for (const s of this.sessions.values()) {
      if (s.shareToken === t) return s;
    }
    return null;
  }

  listSummaries(limit = 50, offset = 0): SessionSummary[] {
    const all = Array.from(this.sessions.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return all.slice(offset, offset + limit).map(s => ({
      id: s.id,
      agentType: s.agentType,
      workingDir: s.workingDir,
      createdAt: s.createdAt,
      title: s.title,
      messageCount: s.messages.length
    }));
  }
}
