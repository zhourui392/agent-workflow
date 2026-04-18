import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { ChatMessageDTO, ChatSessionDTO, ChatSessionSummary, AgentType } from '../api/chat';
import {
  createSession as apiCreate,
  listSessions as apiList,
  getSession as apiGet,
  deleteSession as apiDelete,
  stopSession as apiStop,
  streamMessage
} from '../api/chat';

export type Segment =
  | { type: 'text'; content: string }
  | { type: 'tool'; name: string; content: string }
  | { type: 'tool_result'; content: string }
  | { type: 'result'; content: string };

/**
 * 将一条 assistant 消息（可能是聚合后的多行 stream-json 或自由文本）解析为可渲染 segments。
 * 规则对齐 agent-web/js/app.js 的 parseStreamJson：
 * - stream_event + content_block_start + tool_use → 打开 tool 段
 * - stream_event + content_block_delta + text_delta → 追加到最后一个 text 段
 * - stream_event + content_block_delta + input_json_delta → 追加到最后一个 tool 段
 * - assistant.message.content[] → 整块文本 / 工具调用
 * - user.message.content[] 含 tool_result → 工具结果
 * - result → 结果段
 * 非 JSON 行回落为 text。
 */
export function parseChunksToSegments(chunks: string[]): Segment[] {
  const segs: Segment[] = [];
  const lastText = (): Segment | undefined => {
    const s = segs[segs.length - 1];
    return s && s.type === 'text' ? s : undefined;
  };
  const lastTool = (): Segment | undefined => {
    const s = segs[segs.length - 1];
    return s && s.type === 'tool' ? s : undefined;
  };
  const pushText = (text: string): void => {
    if (!text) return;
    const t = lastText();
    if (t && t.type === 'text') { t.content += text; return; }
    segs.push({ type: 'text', content: text });
  };

  for (const raw of chunks) {
    const line = raw.trim();
    if (!line) continue;
    if (!line.startsWith('{')) { pushText(line + '\n'); continue; }
    let json: Record<string, unknown>;
    try { json = JSON.parse(line) as Record<string, unknown>; }
    catch { pushText(line + '\n'); continue; }

    const type = json.type;

    if (type === 'stream_event') {
      const event = json.event as Record<string, unknown> | undefined;
      if (!event) continue;
      const et = event.type;
      if (et === 'content_block_start') {
        const block = event.content_block as Record<string, unknown> | undefined;
        if (block?.type === 'tool_use') {
          segs.push({ type: 'tool', name: String(block.name ?? 'Tool'), content: '' });
        }
      } else if (et === 'content_block_delta') {
        const delta = event.delta as Record<string, unknown> | undefined;
        if (!delta) continue;
        if (delta.type === 'text_delta' && typeof delta.text === 'string') {
          pushText(delta.text);
        } else if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
          const t = lastTool();
          if (t && t.type === 'tool') t.content += delta.partial_json;
        }
      }
      continue;
    }

    if (type === 'assistant') {
      const message = json.message as Record<string, unknown> | undefined;
      const content = message?.content as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(content)) continue;
      for (const c of content) {
        if (c.type === 'text' && typeof c.text === 'string') {
          pushText(c.text);
        } else if (c.type === 'tool_use') {
          segs.push({
            type: 'tool',
            name: String(c.name ?? 'Tool'),
            content: c.input ? JSON.stringify(c.input, null, 2) : ''
          });
        }
      }
      continue;
    }

    if (type === 'user') {
      const message = json.message as Record<string, unknown> | undefined;
      const content = message?.content as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(content)) continue;
      for (const c of content) {
        if (c.type === 'tool_result') {
          const text = typeof c.content === 'string'
            ? c.content
            : JSON.stringify(c.content, null, 2);
          segs.push({ type: 'tool_result', content: text });
        }
      }
      continue;
    }

    if (type === 'result' && typeof json.result === 'string') {
      segs.push({ type: 'result', content: json.result });
      continue;
    }

    // system / init 等不可见事件丢弃
  }

  // 去掉空 text / 空 tool
  return segs.filter(s => {
    if (s.type === 'text' || s.type === 'result' || s.type === 'tool_result') return s.content.trim() !== '';
    return true;
  });
}

export interface ParsedMessage {
  role: 'user' | 'assistant' | 'system';
  segments: Segment[];
  raw: string;
  timestamp: string;
}

function parseMessage(m: ChatMessageDTO): ParsedMessage {
  if (m.role === 'assistant') {
    const lines = m.content.split('\n');
    const segs = parseChunksToSegments(lines);
    return { role: m.role, segments: segs, raw: m.content, timestamp: m.timestamp };
  }
  return {
    role: m.role,
    segments: [{ type: 'text', content: m.content }],
    raw: m.content,
    timestamp: m.timestamp
  };
}

export const useChatStore = defineStore('chat', () => {
  const sessions = ref<ChatSessionSummary[]>([]);
  const current = ref<ChatSessionDTO | null>(null);
  const parsedMessages = ref<ParsedMessage[]>([]);
  const streaming = ref(false);
  const liveChunks = ref<string[]>([]);
  const liveSegments = ref<Segment[]>([]);
  let closeStream: (() => void) | null = null;

  function rebuildParsed(): void {
    if (!current.value) { parsedMessages.value = []; return; }
    parsedMessages.value = current.value.messages.map(parseMessage);
  }

  async function refreshList(): Promise<void> {
    const resp = await apiList();
    sessions.value = resp.data;
  }

  async function createSession(agentType?: AgentType, workingDir?: string): Promise<void> {
    const resp = await apiCreate(agentType, workingDir);
    current.value = resp.data;
    rebuildParsed();
    liveChunks.value = [];
    liveSegments.value = [];
    await refreshList();
  }

  async function loadSession(id: string): Promise<void> {
    const resp = await apiGet(id);
    current.value = resp.data;
    rebuildParsed();
    liveChunks.value = [];
    liveSegments.value = [];
  }

  async function removeSession(id: string): Promise<void> {
    await apiDelete(id);
    if (current.value?.id === id) {
      current.value = null;
      parsedMessages.value = [];
    }
    await refreshList();
  }

  function sendMessage(message: string, env?: string): void {
    if (!current.value) return;
    const sessionId = current.value.id;

    const userMsg: ChatMessageDTO = {
      role: 'user', content: message, timestamp: new Date().toISOString()
    };
    current.value.messages.push(userMsg);
    parsedMessages.value.push(parseMessage(userMsg));

    streaming.value = true;
    liveChunks.value = [];
    liveSegments.value = [];

    closeStream = streamMessage(sessionId, message, env, {
      onChunk: (chunk) => {
        liveChunks.value.push(chunk);
        liveSegments.value = parseChunksToSegments(liveChunks.value);
      },
      onExit: () => {
        const assembled = liveChunks.value.join('\n');
        if (current.value && assembled.trim() !== '') {
          const asst: ChatMessageDTO = {
            role: 'assistant', content: assembled, timestamp: new Date().toISOString()
          };
          current.value.messages.push(asst);
          parsedMessages.value.push(parseMessage(asst));
        }
        liveChunks.value = [];
        liveSegments.value = [];
        streaming.value = false;
        // 同步 resumeId 并刷新会话列表（首个用户消息会作为 title 回显）
        void apiGet(sessionId).then(r => { if (current.value?.id === sessionId) current.value = r.data; });
        void refreshList();
      },
      onError: () => { streaming.value = false; }
    });
  }

  async function stop(): Promise<void> {
    if (!current.value) return;
    await apiStop(current.value.id);
    if (closeStream) closeStream();
    streaming.value = false;
  }

  /**
   * 进入聊天页的默认初始化：
   * - 若已有 current 直接返回
   * - 刷新列表；有记录则加载最近一条，没有则自动创建
   */
  async function ensureCurrent(): Promise<void> {
    if (current.value) return;
    await refreshList();
    if (sessions.value.length > 0) {
      await loadSession(sessions.value[0].id);
    } else {
      await createSession();
    }
  }

  return {
    sessions, current, parsedMessages, streaming, liveChunks, liveSegments,
    refreshList, createSession, loadSession, removeSession,
    sendMessage, stop, ensureCurrent
  };
});
