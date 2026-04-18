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

export interface TextSegment { type: 'text'; content: string }
export interface ToolSegment { type: 'tool'; id?: string; name: string; content: string }
export type Segment = TextSegment | ToolSegment;

/**
 * 将 stream-json 原始行解析为可渲染的 segments。
 * 原则：不丢数据 + 按 tool_use.id 去重合并。
 * - stream_event → 立即打开 tool 段 / 增量追加文字或 input json
 * - assistant.message.content[] → 按 id 查找并补齐 tool 输入；text 已有则跳过（防重复），无则补
 * - user.message.content[].tool_result → 按 tool_use_id 合并进对应 tool 段；找不到则回溯末尾 tool
 * - result → 仅当无任何可见内容时作 fallback
 */
export function parseChunksToSegments(chunks: string[]): Segment[] {
  const segments: Segment[] = [];

  const lastText = (): TextSegment | undefined => {
    const s = segments[segments.length - 1];
    return s && s.type === 'text' ? s : undefined;
  };
  const lastTool = (): ToolSegment | undefined => {
    for (let j = segments.length - 1; j >= 0; j--) {
      if (segments[j].type === 'tool') return segments[j] as ToolSegment;
    }
    return undefined;
  };
  const findToolById = (id: string | undefined): ToolSegment | undefined => {
    if (!id) return undefined;
    for (const s of segments) if (s.type === 'tool' && s.id === id) return s;
    return undefined;
  };
  const appendText = (text: string): void => {
    if (!text) return;
    const t = lastText();
    if (t) { t.content += text; return; }
    segments.push({ type: 'text', content: text });
  };
  const appendToolJson = (partial: string): void => {
    const t = lastTool();
    if (t) t.content += partial;
  };
  const hasVisibleContent = (): boolean =>
    segments.some(s => s.content && s.content.trim() !== '');

  const truncate = (s: string): string =>
    s.length > 2000 ? s.slice(0, 2000) + `\n... (共 ${s.length} 字符，已截断)` : s;

  for (const raw of chunks) {
    const line = raw.trim();
    if (!line) continue;
    if (!line.startsWith('{') && !line.startsWith('[')) { appendText(line); continue; }

    let json: Record<string, unknown>;
    try { json = JSON.parse(line) as Record<string, unknown>; }
    catch { continue; }

    const type = json.type;

    if (type === 'stream_event') {
      const event = json.event as Record<string, unknown> | undefined;
      if (!event) continue;
      const et = event.type;
      if (et === 'content_block_start') {
        const block = event.content_block as Record<string, unknown> | undefined;
        if (block?.type === 'tool_use') {
          const id = typeof block.id === 'string' ? block.id : undefined;
          // 若同 id 已存在则不重复创建
          if (!findToolById(id)) {
            segments.push({
              type: 'tool',
              id,
              name: String(block.name ?? 'Tool'),
              content: ''
            });
          }
        }
      } else if (et === 'content_block_delta') {
        const delta = event.delta as Record<string, unknown> | undefined;
        if (!delta) continue;
        if (typeof delta.text === 'string') {
          appendText(delta.text);
        } else if (typeof delta.partial_json === 'string') {
          appendToolJson(delta.partial_json);
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
          // 若已经有文本内容（来自 stream_event），跳过；否则补
          const t = lastText();
          if (!t || t.content.trim() === '') appendText(c.text);
        } else if (c.type === 'tool_use') {
          const cid = typeof c.id === 'string' ? c.id : undefined;
          const fullInput = c.input ? JSON.stringify(c.input, null, 2) : '';
          const existing = findToolById(cid);
          if (existing) {
            // 用完整 input 替换（partial_json 拼出来的可能不完整）
            if (fullInput) existing.content = fullInput;
            if (c.name) existing.name = String(c.name);
          } else {
            segments.push({
              type: 'tool',
              id: cid,
              name: String(c.name ?? 'Tool'),
              content: fullInput
            });
          }
        }
      }
      continue;
    }

    if (type === 'user') {
      const message = json.message as Record<string, unknown> | undefined;
      const content = message?.content as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(content)) continue;

      for (const c of content) {
        if (c.type !== 'tool_result') continue;
        let resultText = '';
        const tur = json.tool_use_result as unknown;
        if (tur && typeof tur === 'object') {
          const turObj = tur as Record<string, unknown>;
          const file = turObj.file as Record<string, unknown> | undefined;
          if (file && typeof file.filePath === 'string') {
            const lines = typeof file.numLines === 'number' ? ` (${file.numLines}行)` : '';
            resultText = `[文件: ${file.filePath}${lines}]`;
          } else if (typeof c.content === 'string') {
            resultText = c.content;
          }
        } else if (typeof tur === 'string') {
          resultText = tur;
        }
        if (!resultText && typeof c.content === 'string') resultText = c.content;
        if (!resultText) continue;
        resultText = truncate(resultText);

        const tid = typeof c.tool_use_id === 'string' ? c.tool_use_id : undefined;
        const target = findToolById(tid) ?? lastTool();
        if (target) {
          target.content = (target.content || '') + '\n' + resultText;
        } else {
          segments.push({ type: 'tool', name: 'Tool Result', content: resultText });
        }
      }
      continue;
    }

    if (type === 'result' && typeof json.result === 'string') {
      if (!hasVisibleContent()) {
        segments.push({ type: 'text', content: json.result });
      }
      continue;
    }

    // system / init 等不可见事件丢弃
  }

  // 只过滤掉纯空文本段；空 tool 段保留（显示"调用中…"）
  return segments.filter(s => {
    if (s.type === 'text') return s.content.trim() !== '';
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
