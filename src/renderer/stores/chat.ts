import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { ChatMessageDTO, ChatSessionDTO, ChatSessionSummary, AgentType } from '../api/chat';
import {
  createSession as apiCreate,
  listSessions as apiList,
  getSession as apiGet,
  deleteSession as apiDelete,
  stopSession as apiStop,
  clearContext as apiClearContext,
  updateWorkingDir as apiUpdateWorkingDir,
  streamMessage
} from '../api/chat';
import { parseChunksToEvents, parseAssistantContentToEvents } from '../utils/streamJsonParser';
import type { StepEvent } from '../../main/types';

export interface ParsedMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  events: StepEvent[]; // 仅 assistant 消息非空
  timestamp: string;
}

function parseMessage(m: ChatMessageDTO): ParsedMessage {
  if (m.role === 'assistant') {
    return {
      role: m.role,
      content: m.content,
      events: parseAssistantContentToEvents(m.content),
      timestamp: m.timestamp
    };
  }
  return { role: m.role, content: m.content, events: [], timestamp: m.timestamp };
}

export const useChatStore = defineStore('chat', () => {
  const sessions = ref<ChatSessionSummary[]>([]);
  const current = ref<ChatSessionDTO | null>(null);
  const parsedMessages = ref<ParsedMessage[]>([]);
  const streaming = ref(false);
  const liveChunks = ref<string[]>([]);
  const liveEvents = ref<StepEvent[]>([]);
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
    liveEvents.value = [];
    await refreshList();
  }

  async function loadSession(id: string): Promise<void> {
    const resp = await apiGet(id);
    current.value = resp.data;
    rebuildParsed();
    liveChunks.value = [];
    liveEvents.value = [];
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
    liveEvents.value = [];

    closeStream = streamMessage(sessionId, message, env, {
      onChunk: (chunk) => {
        liveChunks.value.push(chunk);
        liveEvents.value = parseChunksToEvents(liveChunks.value);
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
        liveEvents.value = [];
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

  async function clearContext(): Promise<void> {
    if (!current.value) return;
    const id = current.value.id;
    await apiClearContext(id);
    const resp = await apiGet(id);
    if (current.value?.id === id) current.value = resp.data;
    rebuildParsed();
  }

  async function changeWorkingDir(workingDir: string): Promise<void> {
    if (!current.value) return;
    const id = current.value.id;
    await apiUpdateWorkingDir(id, workingDir);
    const resp = await apiGet(id);
    if (current.value?.id === id) current.value = resp.data;
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
    sessions, current, parsedMessages, streaming, liveChunks, liveEvents,
    refreshList, createSession, loadSession, removeSession,
    sendMessage, stop, ensureCurrent, clearContext, changeWorkingDir
  };
});
