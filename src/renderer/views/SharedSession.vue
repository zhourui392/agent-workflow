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
          <pre class="text">{{ m.raw }}</pre>
        </div>
        <div v-else-if="m.role === 'assistant'" class="bubble assistant">
          <template v-for="(seg, si) in m.segments" :key="si">
            <div
              v-if="seg.type === 'text'"
              class="text-segment markdown"
              v-html="renderMarkdown(seg.content)"
            ></div>
            <div v-else class="tool-block">
              <div class="tool-header" @click="toggle(i, si)">
                <span class="tool-toggle" :class="{ expanded: isExpanded(i, si) }">▶</span>
                <span class="tool-label">{{ seg.name }}</span>
              </div>
              <pre v-show="isExpanded(i, si)" class="tool-content">{{ seg.content || '(empty)' }}</pre>
            </div>
          </template>
        </div>
        <div v-else class="bubble system">
          <pre class="text">{{ m.raw }}</pre>
        </div>
      </div>
      <el-empty v-if="parsed.length === 0" description="暂无消息" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { marked } from 'marked';
import { getSharedSession, type SharedSessionDTO, type ChatMessageDTO } from '../api/chat';
import { parseChunksToSegments, type Segment } from '../stores/chat';

marked.setOptions({ breaks: true, gfm: true });

const route = useRoute();
const token = computed(() => String(route.params.token));

const data = ref<SharedSessionDTO | null>(null);
const loading = ref(true);
const error = ref<string>('');

interface ParsedMsg {
  role: 'user' | 'assistant' | 'system';
  segments: Segment[];
  raw: string;
}

function toParsed(m: ChatMessageDTO): ParsedMsg {
  if (m.role === 'assistant') {
    const segs = parseChunksToSegments(m.content.split('\n'));
    return { role: m.role, segments: segs, raw: m.content };
  }
  return {
    role: m.role,
    segments: [{ type: 'text', content: m.content }],
    raw: m.content
  };
}

const parsed = computed<ParsedMsg[]>(() => data.value ? data.value.messages.map(toParsed) : []);

const expandedTools = reactive<Record<string, boolean>>({});
function key(mi: number, si: number): string { return `${mi}:${si}`; }
function isExpanded(mi: number, si: number): boolean { return !!expandedTools[key(mi, si)]; }
function toggle(mi: number, si: number): void {
  const k = key(mi, si);
  expandedTools[k] = !expandedTools[k];
}

function renderMarkdown(content: string): string {
  try { return marked.parse(content) as string; }
  catch {
    return content.replace(/[&<>"']/g, (c) => {
      const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
      return map[c] ?? c;
    });
  }
}

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

.bubble { max-width: 85%; padding: 10px 14px; border-radius: 8px; line-height: 1.6; font-size: 14px; }
.bubble.user { background: #409eff; color: #fff; }
.bubble.user .text { color: #fff; }
.bubble.assistant { background: #f5f7fa; color: #303133; }
.bubble.system { background: #fdf6ec; color: #b88230; font-size: 12px; }

.text { margin: 0; white-space: pre-wrap; word-break: break-word; font-family: inherit; font-size: 14px; }
.text-segment { margin: 4px 0; }
.text-segment.markdown :deep(p) { margin: 6px 0; }
.text-segment.markdown :deep(pre) {
  background: #272822; color: #f8f8f2; padding: 10px 12px; border-radius: 4px;
  overflow-x: auto; font-size: 12px; margin: 8px 0;
}
.text-segment.markdown :deep(code) {
  background: rgba(0,0,0,0.06); padding: 1px 5px; border-radius: 3px;
  font-family: ui-monospace, monospace; font-size: 12.5px;
}
.text-segment.markdown :deep(pre code) { background: transparent; padding: 0; color: inherit; font-size: 12px; }
.text-segment.markdown :deep(ul),
.text-segment.markdown :deep(ol) { padding-left: 22px; margin: 6px 0; }

.tool-block { margin: 8px 0; border: 1px solid #e4e7ed; border-radius: 6px; background: #fafbfc; overflow: hidden; }
.tool-header { display: flex; align-items: center; gap: 8px; padding: 6px 10px; cursor: pointer; user-select: none; font-size: 12px; color: #606266; }
.tool-header:hover { background: rgba(64, 158, 255, 0.06); }
.tool-toggle { font-size: 10px; transition: transform .15s; display: inline-block; }
.tool-toggle.expanded { transform: rotate(90deg); }
.tool-label { font-weight: 500; }
.tool-content { margin: 0; padding: 8px 12px; background: #272822; color: #f8f8f2; font-family: ui-monospace, monospace; font-size: 12px; white-space: pre-wrap; word-break: break-word; max-height: 360px; overflow-y: auto; }
</style>
