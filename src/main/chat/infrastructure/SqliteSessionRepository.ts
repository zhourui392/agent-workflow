/**
 * SQLite 会话仓库实现
 *
 * 持久化聊天会话和消息到 `chat_sessions` / `chat_messages` 两张表。
 * findById 会级联加载消息列表。
 */

import type Database from 'better-sqlite3';
import { ChatSession } from '../domain/model/ChatSession';
import type { AgentType } from '../domain/model/AgentType';
import { isAgentType } from '../domain/model/AgentType';
import type { ChatMessage, MessageRole } from '../domain/model/ChatMessage';
import type { SessionRepository, SessionSummary } from '../domain/repository/SessionRepository';

interface SessionRow {
  id: string;
  agent_type: string;
  working_dir: string;
  created_at: string;
  resume_id: string | null;
  title: string | null;
  share_token: string | null;
}

interface MessageRow {
  role: string;
  content: string;
  timestamp: string;
}

interface SummaryRow extends SessionRow {
  message_count: number;
}

function toAgentType(raw: string): AgentType {
  return isAgentType(raw) ? raw : 'claude';
}

function toRole(raw: string): MessageRole {
  if (raw === 'user' || raw === 'assistant' || raw === 'system') return raw;
  return 'system';
}

export class SqliteSessionRepository implements SessionRepository {
  constructor(private readonly db: Database.Database) {}

  save(session: ChatSession): void {
    const stmt = this.db.prepare(`
      INSERT INTO chat_sessions (id, agent_type, working_dir, created_at, resume_id, title, share_token)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        agent_type = excluded.agent_type,
        working_dir = excluded.working_dir,
        resume_id = excluded.resume_id,
        title = excluded.title,
        share_token = COALESCE(chat_sessions.share_token, excluded.share_token)
    `);
    stmt.run(
      session.id,
      session.agentType,
      session.workingDir,
      session.createdAt.toISOString(),
      session.resumeId ?? null,
      session.title ?? null,
      session.shareToken ?? null
    );
  }

  private rowToSession(row: SessionRow): ChatSession {
    const msgRows = this.db.prepare(
      'SELECT role, content, timestamp FROM chat_messages WHERE session_id = ? ORDER BY id ASC'
    ).all(row.id) as MessageRow[];

    const messages: ChatMessage[] = msgRows.map(m => ({
      role: toRole(m.role),
      content: m.content,
      timestamp: new Date(m.timestamp)
    }));

    return ChatSession.fromSnapshot({
      id: row.id,
      agentType: toAgentType(row.agent_type),
      workingDir: row.working_dir,
      createdAt: new Date(row.created_at),
      resumeId: row.resume_id ?? undefined,
      title: row.title ?? undefined,
      shareToken: row.share_token ?? undefined,
      messages
    });
  }

  find(id: string): ChatSession | null {
    const row = this.db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(id) as SessionRow | undefined;
    if (!row) return null;
    return this.rowToSession(row);
  }

  setShareToken(id: string, token: string): string | null {
    if (!token || token.trim() === '') return null;
    const existing = this.db.prepare('SELECT share_token FROM chat_sessions WHERE id = ?').get(id) as { share_token: string | null } | undefined;
    if (!existing) return null;
    if (existing.share_token && existing.share_token.trim() !== '') return existing.share_token;
    this.db.prepare('UPDATE chat_sessions SET share_token = ? WHERE id = ?').run(token.trim(), id);
    return token.trim();
  }

  findByShareToken(token: string): ChatSession | null {
    if (!token || token.trim() === '') return null;
    const row = this.db.prepare('SELECT * FROM chat_sessions WHERE share_token = ?').get(token.trim()) as SessionRow | undefined;
    if (!row) return null;
    return this.rowToSession(row);
  }

  remove(id: string): boolean {
    this.db.prepare('DELETE FROM chat_messages WHERE session_id = ?').run(id);
    const info = this.db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(id);
    return info.changes > 0;
  }

  updateResumeId(id: string, resumeId: string): void {
    if (!resumeId || resumeId.trim() === '') return;
    this.db.prepare('UPDATE chat_sessions SET resume_id = ? WHERE id = ?').run(resumeId.trim(), id);
  }

  addMessage(id: string, role: 'user' | 'assistant' | 'system', content: string, timestamp?: Date): void {
    const ts = (timestamp ?? new Date()).toISOString();
    this.db.prepare(
      'INSERT INTO chat_messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)'
    ).run(id, role, content, ts);
  }

  listSummaries(limit = 50, offset = 0): SessionSummary[] {
    // title 缺省时回退到第一条用户消息（截断 50 字），与 agent-web 一致
    const rows = this.db.prepare(`
      SELECT
        s.*,
        COALESCE(
          s.title,
          (SELECT m.content FROM chat_messages m
           WHERE m.session_id = s.id AND m.role = 'user'
           ORDER BY m.id ASC LIMIT 1)
        ) AS computed_title,
        (SELECT COUNT(*) FROM chat_messages m WHERE m.session_id = s.id) AS message_count
      FROM chat_sessions s
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as (SummaryRow & { computed_title: string | null })[];

    return rows.map(r => {
      const raw = r.computed_title ?? undefined;
      const title = raw && raw.length > 50 ? raw.slice(0, 50) + '...' : raw;
      return {
        id: r.id,
        agentType: r.agent_type,
        workingDir: r.working_dir,
        createdAt: new Date(r.created_at),
        title,
        messageCount: r.message_count
      };
    });
  }
}
