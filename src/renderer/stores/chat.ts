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

export const useChatStore = defineStore('chat', () => {
  const sessions = ref<ChatSessionSummary[]>([]);
  const current = ref<ChatSessionDTO | null>(null);
  const streaming = ref(false);
  const liveChunks = ref<string[]>([]);
  let closeStream: (() => void) | null = null;

  async function refreshList(): Promise<void> {
    const resp = await apiList();
    sessions.value = resp.data;
  }

  async function createSession(agentType: AgentType, workingDir: string): Promise<void> {
    const resp = await apiCreate(agentType, workingDir);
    current.value = resp.data;
    await refreshList();
  }

  async function loadSession(id: string): Promise<void> {
    const resp = await apiGet(id);
    current.value = resp.data;
    liveChunks.value = [];
  }

  async function removeSession(id: string): Promise<void> {
    await apiDelete(id);
    if (current.value?.id === id) current.value = null;
    await refreshList();
  }

  function sendMessage(message: string, env?: string): void {
    if (!current.value) return;
    const sessionId = current.value.id;
    // 立即把 user 消息推到 UI
    const userMsg: ChatMessageDTO = {
      role: 'user', content: message, timestamp: new Date().toISOString()
    };
    current.value.messages.push(userMsg);

    streaming.value = true;
    liveChunks.value = [];

    closeStream = streamMessage(sessionId, message, env, {
      onChunk: (chunk) => { liveChunks.value.push(chunk); },
      onExit: () => {
        const assembled = liveChunks.value.join('\n');
        if (current.value && assembled.trim() !== '') {
          current.value.messages.push({
            role: 'assistant', content: assembled, timestamp: new Date().toISOString()
          });
        }
        liveChunks.value = [];
        streaming.value = false;
        // 刷新一次以拿到服务端写入的 resumeId
        void apiGet(sessionId).then(r => { if (current.value?.id === sessionId) current.value = r.data; });
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

  return {
    sessions, current, streaming, liveChunks,
    refreshList, createSession, loadSession, removeSession, sendMessage, stop
  };
});
