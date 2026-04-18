<template>
  <div class="share-page">
    <div class="share-header">
      <div class="title">{{ data?.title || '对话分享' }}</div>
      <div class="meta">
        <el-tag size="small">{{ data?.agentType || '-' }}</el-tag>
        <el-tag size="small" type="info">只读</el-tag>
        <span v-if="data?.createdAt" class="created">{{ formatTime(data.createdAt) }}</span>
      </div>
    </div>

    <div v-if="loading" class="state">
      <el-empty description="加载中..." />
    </div>
    <div v-else-if="error" class="state">
      <el-empty :description="error" />
    </div>
    <div v-else class="messages">
      <div
        v-for="(m, i) in parsed"
        :key="i"
        class="message"
        :class="m.role"
      >
        <div v-if="m.role === 'user'" class="bubble user">
          <pre class="text">{{ m.content }}</pre>
        </div>
        <div v-else-if="m.role === 'assistant'" class="bubble assistant">
          <ChatAssistantRenderer :events="m.events" :output-text="m.content" />
        </div>
        <div v-else class="bubble system">
          <pre class="text">{{ m.content }}</pre>
        </div>
      </div>
      <el-empty v-if="parsed.length === 0" description="暂无消息" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import ChatAssistantRenderer from '../components/ChatAssistantRenderer.vue';
import { getSharedSession, type SharedSessionDTO, type ChatMessageDTO } from '../api/chat';
import { parseAssistantContentToEvents } from '../utils/streamJsonParser';
import type { StepEvent } from '../../main/types';

const route = useRoute();
const token = computed(() => String(route.params.token));

const data = ref<SharedSessionDTO | null>(null);
const loading = ref(true);
const error = ref<string>('');

interface ParsedMsg {
  role: 'user' | 'assistant' | 'system';
  content: string;
  events: StepEvent[];
}

function toParsed(m: ChatMessageDTO): ParsedMsg {
  if (m.role === 'assistant') {
    return { role: m.role, content: m.content, events: parseAssistantContentToEvents(m.content) };
  }
  return { role: m.role, content: m.content, events: [] };
}

const parsed = computed<ParsedMsg[]>(() => data.value ? data.value.messages.map(toParsed) : []);

function formatTime(iso: string): string { return new Date(iso).toLocaleString(); }

onMounted(async () => {
  try {
    const resp = await getSharedSession(token.value);
    data.value = resp.data;
  } catch (e) {
    error.value = '分享链接无效或已失效';
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.share-page { max-width: 1000px; margin: 0 auto; padding: 24px 16px; }
.share-header {
  background: #fff; padding: 16px 20px;
  border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  margin-bottom: 16px;
}
.title { font-size: 18px; font-weight: 600; color: #303133; margin-bottom: 8px; }
.meta { display: flex; gap: 8px; align-items: center; }
.meta .created { color: #909399; font-size: 12px; margin-left: 8px; }

.state { padding: 40px 0; display: flex; justify-content: center; }
.messages { background: #fff; padding: 16px; border-radius: 8px; }

.message { margin-bottom: 14px; display: flex; }
.message.user { justify-content: flex-end; }
.message.assistant { justify-content: flex-start; }
.message.system { justify-content: center; }

.bubble { max-width: 90%; padding: 10px 14px; border-radius: 8px; line-height: 1.6; font-size: 14px; }
.bubble.user { background: #409eff; color: #fff; max-width: 80%; }
.bubble.user .text { color: #fff; }
.bubble.assistant { background: #f5f7fa; color: #303133; min-width: 60%; }
.bubble.system { background: #fdf6ec; color: #b88230; font-size: 12px; }

.text { margin: 0; white-space: pre-wrap; word-break: break-word; font-family: inherit; font-size: 14px; }
</style>
