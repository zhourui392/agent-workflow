/**
 * 聊天会话（聚合根）
 *
 * 状态不变量：
 * - 创建后 id / agentType / workingDir / createdAt 不可变
 * - resumeId 只能通过 updateResumeId 更新
 * - messages 按添加顺序追加
 */

import { randomUUID } from 'crypto';
import type { AgentType } from './AgentType';
import type { ChatMessage, MessageRole } from './ChatMessage';
import { createMessage } from './ChatMessage';

export interface ChatSessionSnapshot {
  id: string;
  agentType: AgentType;
  workingDir: string;
  createdAt: Date;
  resumeId?: string;
  title?: string;
  shareToken?: string;
  messages: ChatMessage[];
}

export class ChatSession {
  readonly id: string;
  readonly agentType: AgentType;
  readonly workingDir: string;
  readonly createdAt: Date;
  private _resumeId?: string;
  private _title?: string;
  private _shareToken?: string;
  private readonly _messages: ChatMessage[];

  private constructor(snapshot: ChatSessionSnapshot) {
    if (!snapshot.workingDir || snapshot.workingDir.trim() === '') {
      throw new Error('workingDir is required');
    }
    this.id = snapshot.id;
    this.agentType = snapshot.agentType;
    this.workingDir = snapshot.workingDir;
    this.createdAt = snapshot.createdAt;
    this._resumeId = snapshot.resumeId;
    this._title = snapshot.title;
    this._shareToken = snapshot.shareToken;
    this._messages = [...snapshot.messages];
  }

  static create(agentType: AgentType, workingDir: string): ChatSession {
    return new ChatSession({
      id: randomUUID(),
      agentType,
      workingDir,
      createdAt: new Date(),
      messages: []
    });
  }

  static fromSnapshot(snapshot: ChatSessionSnapshot): ChatSession {
    return new ChatSession(snapshot);
  }

  get resumeId(): string | undefined { return this._resumeId; }
  get title(): string | undefined { return this._title; }
  get shareToken(): string | undefined { return this._shareToken; }
  get messages(): readonly ChatMessage[] { return this._messages; }

  setShareToken(token: string): void {
    if (!token || token.trim() === '') return;
    this._shareToken = token.trim();
  }

  addMessage(role: MessageRole, content: string): ChatMessage {
    const msg = createMessage(role, content);
    this._messages.push(msg);
    return msg;
  }

  updateResumeId(resumeId: string): void {
    if (!resumeId || resumeId.trim() === '') return;
    this._resumeId = resumeId.trim();
  }

  clearResumeId(): void {
    this._resumeId = undefined;
  }

  updateWorkingDir(workingDir: string): void {
    if (!workingDir || workingDir.trim() === '') return;
    (this as { workingDir: string }).workingDir = workingDir.trim();
  }

  setTitle(title: string): void {
    this._title = title;
  }

  toSnapshot(): ChatSessionSnapshot {
    return {
      id: this.id,
      agentType: this.agentType,
      workingDir: this.workingDir,
      createdAt: this.createdAt,
      resumeId: this._resumeId,
      title: this._title,
      shareToken: this._shareToken,
      messages: [...this._messages]
    };
  }
}
