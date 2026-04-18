<template>
  <div class="chat-assistant">
    <template v-for="(item, i) in items" :key="i">
      <div
        v-if="item.type === 'text'"
        class="text-segment markdown"
        v-html="renderMarkdown(item.content)"
      ></div>
      <div
        v-else
        class="tool-block"
        :class="{ 'is-error': item.isError }"
      >
        <div class="tool-header" @click="toggle(i)">
          <span class="tool-toggle" :class="{ expanded: isExpanded(i) }">▶</span>
          <span class="tool-icon">{{ getToolIcon(item.name) }}</span>
          <span class="tool-label">{{ item.name }}</span>
          <span class="tool-summary">{{ item.summary }}</span>
          <span v-if="item.result !== undefined" class="tool-status" :class="{ error: item.isError }">
            {{ item.isError ? '✗' : '✓' }}
          </span>
        </div>
        <div v-show="isExpanded(i)" class="tool-body">
          <pre v-if="item.input" class="tool-pre">{{ item.input }}</pre>
          <div v-if="item.result !== undefined" class="tool-divider">输出</div>
          <pre v-if="item.result !== undefined" class="tool-pre" :class="{ 'is-error': item.isError }">{{ item.result || '(空)' }}</pre>
        </div>
      </div>
    </template>

    <div v-if="items.length === 0 && outputText" class="text-segment markdown" v-html="renderMarkdown(outputText)"></div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import { marked } from 'marked';
import type { StepEvent, ToolCallEvent, ToolResultEvent, TextEvent } from '../../main/types';
import { getToolIcon } from '@/utils/toolIconUtils';

marked.setOptions({ breaks: true, gfm: true });

const props = defineProps<{
  events?: StepEvent[];
  outputText?: string;
}>();

interface TextItem { type: 'text'; content: string }
interface ToolItem {
  type: 'tool';
  name: string;
  toolUseId: string;
  input: string;
  summary: string;
  result?: string;
  isError?: boolean;
}
type DisplayItem = TextItem | ToolItem;

/**
 * 把事件展平为 agent-web 风格显示项：
 * - 相邻文本合并为一个 text 段
 * - tool_call + tool_result（同 toolUseId）合并为一个 tool 段
 * - init / turn_end / result / error 忽略
 */
const items = computed<DisplayItem[]>(() => {
  const events = props.events ?? [];
  const out: DisplayItem[] = [];
  const toolIdx = new Map<string, number>();

  for (const e of events) {
    if (e.type === 'text') {
      const t = e as TextEvent;
      const last = out[out.length - 1];
      if (last && last.type === 'text') last.content += t.text;
      else out.push({ type: 'text', content: t.text });
    } else if (e.type === 'tool_call') {
      const c = e as ToolCallEvent;
      const inputStr = c.input && Object.keys(c.input).length > 0 ? JSON.stringify(c.input, null, 2) : '';
      const idx = out.push({
        type: 'tool',
        name: c.toolName,
        toolUseId: c.toolUseId,
        input: inputStr,
        summary: summarize(c.toolName, c.input)
      }) - 1;
      toolIdx.set(c.toolUseId, idx);
    } else if (e.type === 'tool_result') {
      const r = e as ToolResultEvent;
      const idx = toolIdx.get(r.toolUseId);
      if (idx !== undefined) {
        const item = out[idx] as ToolItem;
        item.result = r.output;
        item.isError = r.isError;
      } else {
        out.push({
          type: 'tool',
          name: r.toolName,
          toolUseId: r.toolUseId,
          input: '',
          summary: '',
          result: r.output,
          isError: r.isError
        });
      }
    }
  }
  return out;
});

function summarize(name: string, input: Record<string, unknown>): string {
  if (!input) return '';
  const pick = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = input[k];
      if (typeof v === 'string' && v) return v;
    }
    return undefined;
  };
  switch (name) {
    case 'Read':
    case 'Write':
    case 'Edit':
      return truncate(pick('file_path', 'filePath') ?? '', 80);
    case 'Bash':
      return truncate(pick('command') ?? '', 80);
    case 'Grep':
      return `"${pick('pattern') ?? ''}"${pick('path') ? ' in ' + pick('path') : ''}`;
    case 'Glob':
      return truncate(pick('pattern') ?? '', 80);
    case 'WebSearch':
      return truncate(pick('query') ?? '', 80);
    case 'WebFetch':
      return truncate(pick('url') ?? '', 80);
    default:
      return '';
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

const expanded = reactive<Record<number, boolean>>({});
function isExpanded(i: number): boolean { return !!expanded[i]; }
function toggle(i: number): void { expanded[i] = !expanded[i]; }

function renderMarkdown(text: string): string {
  try { return marked.parse(text) as string; }
  catch {
    return text.replace(/[&<>"']/g, (c) => {
      const map: Record<string, string> = {
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      };
      return map[c] ?? c;
    });
  }
}
</script>

<style scoped>
.chat-assistant { display: flex; flex-direction: column; gap: 6px; }

.text-segment { line-height: 1.7; font-size: 14px; word-break: break-word; }
.text-segment.markdown :deep(p) { margin: 6px 0; }
.text-segment.markdown :deep(p:first-child) { margin-top: 0; }
.text-segment.markdown :deep(p:last-child) { margin-bottom: 0; }
.text-segment.markdown :deep(code) {
  background: rgba(0, 0, 0, 0.06);
  padding: 1px 6px;
  border-radius: 3px;
  font-family: 'Consolas', 'Monaco', ui-monospace, monospace;
  font-size: 12.5px;
}
.text-segment.markdown :deep(pre) {
  background: #f6f8fa;
  border: 1px solid #eaeef2;
  border-radius: 6px;
  padding: 10px 12px;
  overflow-x: auto;
  font-size: 12px;
  margin: 8px 0;
}
.text-segment.markdown :deep(pre code) { background: transparent; padding: 0; font-size: 12px; }
.text-segment.markdown :deep(ul),
.text-segment.markdown :deep(ol) { padding-left: 22px; margin: 6px 0; }
.text-segment.markdown :deep(h1),
.text-segment.markdown :deep(h2),
.text-segment.markdown :deep(h3),
.text-segment.markdown :deep(h4) { margin: 10px 0 6px; font-weight: 600; }
.text-segment.markdown :deep(blockquote) {
  border-left: 3px solid #dcdfe6;
  padding-left: 10px;
  color: #606266;
  margin: 6px 0;
}
.text-segment.markdown :deep(a) { color: #409eff; text-decoration: none; }
.text-segment.markdown :deep(a:hover) { text-decoration: underline; }
.text-segment.markdown :deep(table) { border-collapse: collapse; margin: 8px 0; }
.text-segment.markdown :deep(th),
.text-segment.markdown :deep(td) { border: 1px solid #dcdfe6; padding: 4px 8px; }

.tool-block {
  background: #f5f7fa;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  overflow: hidden;
  font-size: 12px;
}
.tool-block.is-error { border-color: #fab6b6; background: #fef3f3; }

.tool-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  user-select: none;
  color: #606266;
  transition: background 0.15s;
}
.tool-header:hover { background: #ebeef5; }
.tool-toggle {
  font-size: 9px;
  transition: transform 0.15s;
  display: inline-block;
  color: #909399;
  flex-shrink: 0;
}
.tool-toggle.expanded { transform: rotate(90deg); }
.tool-icon { font-size: 13px; flex-shrink: 0; }
.tool-label { font-weight: 600; color: #303133; flex-shrink: 0; }
.tool-summary {
  color: #606266;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  font-family: 'Consolas', 'Monaco', ui-monospace, monospace;
  font-size: 12px;
}
.tool-status { flex-shrink: 0; font-size: 12px; color: #67c23a; }
.tool-status.error { color: #f56c6c; }

.tool-body {
  border-top: 1px solid #e4e7ed;
  background: #fafafa;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.tool-divider {
  font-size: 11px;
  color: #909399;
  font-weight: 600;
  letter-spacing: 0.5px;
}
.tool-pre {
  margin: 0;
  font-family: 'Consolas', 'Monaco', ui-monospace, monospace;
  font-size: 12px;
  line-height: 1.55;
  color: #303133;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 360px;
  overflow-y: auto;
  background: #fff;
  border: 1px solid #eaeef2;
  border-radius: 4px;
  padding: 8px 10px;
}
.tool-pre.is-error { color: #f56c6c; background: #fef3f3; border-color: #fab6b6; }
</style>
