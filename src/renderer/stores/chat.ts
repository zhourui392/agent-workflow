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
  | { type: 'tool'; name: string; content: string };

/**
 * 将一条 assistant 输出（stream-json 多行聚合文本）解析为可渲染 segments。
 * 严格对齐 agent-web/js/app.js 的解析策略：
 * - stream_event + content_block_start + tool_use → push 新 tool 段
 * - stream_event + content_block_delta(text_delta)   → 追加到最后一个 text 段
 * - stream_event + content_block_delta(input_json)   → 追加到最后一个 tool 段
 * - assistant.message.content[]                       → 仅当已有 segments 为空时用完整块替换
 * - user.message.content[].tool_result                → **合并**进最后一个 tool 段（而非新段）
 * - result                                            → 仅当无内容时作为 fallback 文本
 * - tool_use_result.file → 格式化为 [文件: path (N行)]
 * - 工具结果超 2000 字截断
 */
export function parseChunksToSegments(chunks: string[]): Segment[] {
  let segments: Segment[] = [];

  const appendText = (text: string): void => {
    if (!text) return;
    const last = segments[segments.length - 1];
    if (last && last.type === 'text') { last.content += text; return; }
    segments.push({ type: 'text', content: text });
  };

  const appendToolContent = (content: string): void => {
    for (let j = segments.length - 1; j >= 0; j--) {
      if (segments[j].type === 'tool') {
        (segments[j] as { content: string }).content += content;
        return;
      }
    }
  };

  const hasContent = (): boolean =>
    segments.some(s => s.content && s.content.trim() !== '');

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
          segments.push({ type: 'tool', name: String(block.name ?? 'Tool'), content: '' });
        }
      } else if (et === 'content_block_delta') {
        const delta = event.delta as Record<string, unknown> | undefined;
        if (!delta) continue;
        if (typeof delta.text === 'string') {
          appendText(delta.text);
        } else if (delta.type === 'text_delta' && typeof delta.text === 'string') {
          appendText(delta.text);
        } else if (typeof delta.partial_json === 'string') {
          appendToolContent(delta.partial_json);
        }
      }
      continue;
    }

    if (type === 'assistant') {
      const message = json.message as Record<string, unknown> | undefined;
      const content = message?.content as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(content)) continue;
      // 仅当流式阶段没产生内容时，才用完整块替换；否则丢弃（防止重复）
      if (!hasContent()) {
        segments = [];
        for (const c of content) {
          if (c.type === 'text' && typeof c.text === 'string') {
            segments.push({ type: 'text', content: c.text });
          } else if (c.type === 'tool_use') {
            segments.push({
              type: 'tool',
              name: String(c.name ?? 'Tool'),
              content: c.input ? JSON.stringify(c.input, null, 2) : ''
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
        if (resultText.length > 2000) {
          resultText = resultText.slice(0, 2000) + `\n... (共 ${resultText.length} 字符，已截断)`;
        }
        // 合并到最后一个 tool 段
        let merged = false;
        for (let j = segments.length - 1; j >= 0; j--) {
          if (segments[j].type === 'tool') {
            (segments[j] as { content: string }).content =
              ((segments[j] as { content: string }).content || '') + '\n' + resultText;
            merged = true;
            break;
          }
        }
        if (!merged) {
          segments.push({ type: 'tool', name: 'Tool Result', content: resultText });
        }
      }
      continue;
    }

    if (type === 'result' && typeof json.result === 'string') {
      if (!hasContent()) {
        segments.push({ type: 'text', content: json.result });
      }
      continue;
    }

    // system / init / 其他 → 丢弃（不可见事件）
  }

  // 过滤空段
  return segments.filter(s => s.content && s.content.trim() !== '');
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
