/**
 * 会话仓库接口（端口）
 */

import type { ChatSession } from '../model/ChatSession';

export interface SessionSummary {
  id: string;
  agentType: string;
  workingDir: string;
  createdAt: Date;
  title?: string;
  messageCount: number;
}

export interface SessionRepository {
  save(session: ChatSession): void;
  find(id: string): ChatSession | null;
  remove(id: string): boolean;
  updateResumeId(id: string, resumeId: string): void;
  clearResumeId(id: string): void;
  updateWorkingDir(id: string, workingDir: string): void;
  addMessage(id: string, role: 'user' | 'assistant' | 'system', content: string, timestamp?: Date): void;
  listSummaries(limit?: number, offset?: number): SessionSummary[];
  /**
   * 幂等设置 shareToken：若已有返回旧值，否则写入传入值并返回它。
   */
  setShareToken(id: string, token: string): string | null;
  findByShareToken(token: string): ChatSession | null;
}
