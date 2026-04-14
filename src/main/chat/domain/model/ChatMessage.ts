/**
 * 聊天消息（值对象）
 */
export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  role: MessageRole;
  content: string;
  timestamp: Date;
}

export function createMessage(role: MessageRole, content: string, timestamp?: Date): ChatMessage {
  return { role, content, timestamp: timestamp ?? new Date() };
}
