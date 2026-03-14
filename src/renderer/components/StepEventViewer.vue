<template>
  <div class="step-event-viewer">
    <!-- 无事件时 fallback 显示纯文本 -->
    <template v-if="!events || events.length === 0">
      <pre v-if="outputText" class="code-block output">{{ outputText }}</pre>
      <div v-else class="empty-hint">暂无输出</div>
    </template>

    <!-- 有事件时结构化展示 -->
    <template v-else>
      <!-- 初始化信息 -->
      <div v-if="initEvent" class="event-init">
        <span class="init-icon">&#9881;</span>
        <span class="init-label">模型: {{ initEvent.model }}</span>
        <span class="init-label">工具: {{ initEvent.tools.length }}个</span>
        <span v-if="initEvent.mcpServers.length" class="init-label">
          MCP: {{ initEvent.mcpServers.map(s => s.name).join(', ') }}
        </span>
      </div>

      <!-- 按 Turn 分组展示 -->
      <div v-for="turn in turns" :key="turn.index" class="turn-group">
        <div class="turn-header">
          <span class="turn-icon">&#128172;</span>
          <span>Turn {{ turn.index + 1 }}</span>
        </div>

        <div class="turn-body">
          <div v-for="(item, idx) in turn.items" :key="idx" class="event-item">
            <!-- 工具调用 -->
            <template v-if="item.type === 'tool_call'">
              <div class="tool-call-header" @click="toggleExpand(`${turn.index}-call-${idx}`)">
                <span class="tool-icon">{{ getToolIcon(item.toolName) }}</span>
                <span class="tool-name">{{ item.toolName }}</span>
                <span class="tool-summary">{{ getToolCallSummary(item) }}</span>
                <el-icon class="expand-icon"><ArrowRight v-if="!isExpanded(`${turn.index}-call-${idx}`)" /><ArrowDown v-else /></el-icon>
              </div>
              <div v-if="isExpanded(`${turn.index}-call-${idx}`)" class="tool-detail">
                <pre class="detail-block">{{ formatJson(item.input) }}</pre>
              </div>
            </template>

            <!-- 工具结果 -->
            <template v-if="item.type === 'tool_result'">
              <div class="tool-result-header" @click="toggleExpand(`${turn.index}-result-${idx}`)">
                <span class="result-icon" :class="{ 'is-error': item.isError }">{{ item.isError ? '&#10060;' : '&#10003;' }}</span>
                <span class="tool-name">{{ item.toolName }}</span>
                <span class="tool-summary">{{ getToolResultSummary(item) }}</span>
                <el-icon class="expand-icon"><ArrowRight v-if="!isExpanded(`${turn.index}-result-${idx}`)" /><ArrowDown v-else /></el-icon>
              </div>
              <div v-if="isExpanded(`${turn.index}-result-${idx}`)" class="tool-detail">
                <pre class="detail-block" :class="{ 'is-error': item.isError }">{{ item.output }}</pre>
              </div>
            </template>

            <!-- 文本回复 -->
            <template v-if="item.type === 'text'">
              <div class="text-event">
                <span class="text-icon">&#128196;</span>
                <div class="text-content" v-html="renderMarkdown(item.text)"></div>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- 最终结果 -->
      <div v-if="resultEvent" class="event-result" :class="resultEvent.success ? 'is-success' : 'is-error'">
        <span>{{ resultEvent.success ? '&#9989;' : '&#10060;' }} 完成</span>
        <span class="result-meta">{{ resultEvent.numTurns }} 轮对话</span>
        <span class="result-meta">{{ formatTokens(resultEvent.inputTokens + resultEvent.outputTokens) }} tokens</span>
        <span v-if="resultEvent.totalCostUsd > 0" class="result-meta">${{ resultEvent.totalCostUsd.toFixed(4) }}</span>
        <span class="result-meta">{{ formatDuration(resultEvent.durationMs) }}</span>
      </div>

      <!-- 错误事件 -->
      <div v-for="(err, idx) in errorEvents" :key="`err-${idx}`" class="event-error">
        <el-alert :title="err.message" type="error" :closable="false" show-icon />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowRight, ArrowDown } from '@element-plus/icons-vue'
import type {
  StepEvent,
  InitEvent,
  TextEvent,
  ToolCallEvent,
  ToolResultEvent,
  ResultEvent,
  ErrorEvent
} from '../../main/store/models'
import { getToolIcon } from '@/utils/toolIconUtils'
import { formatDurationMs } from '@/utils/dateUtils'

const props = defineProps<{
  events?: StepEvent[]
  outputText?: string
}>()

const expandedKeys = ref<Set<string>>(new Set())

function toggleExpand(key: string) {
  if (expandedKeys.value.has(key)) {
    expandedKeys.value.delete(key)
  } else {
    expandedKeys.value.add(key)
  }
}

function isExpanded(key: string): boolean {
  return expandedKeys.value.has(key)
}

/** 初始化事件 */
const initEvent = computed<InitEvent | null>(() => {
  const e = props.events?.find(e => e.type === 'init')
  return e ? e as InitEvent : null
})

/** 最终结果事件 */
const resultEvent = computed<ResultEvent | null>(() => {
  const e = props.events?.find(e => e.type === 'result')
  return e ? e as ResultEvent : null
})

/** 错误事件列表 */
const errorEvents = computed<ErrorEvent[]>(() => {
  return (props.events?.filter(e => e.type === 'error') || []) as ErrorEvent[]
})

/** 按 Turn 分组的交互事件 */
interface TurnGroup {
  index: number
  items: (TextEvent | ToolCallEvent | ToolResultEvent)[]
}

const turns = computed<TurnGroup[]>(() => {
  if (!props.events) return []

  const turnMap = new Map<number, (TextEvent | ToolCallEvent | ToolResultEvent)[]>()

  for (const event of props.events) {
    if (event.type === 'text' || event.type === 'tool_call' || event.type === 'tool_result') {
      const turnIdx = event.turnIndex
      if (!turnMap.has(turnIdx)) {
        turnMap.set(turnIdx, [])
      }
      turnMap.get(turnIdx)!.push(event)
    }
  }

  return Array.from(turnMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([index, items]) => ({ index, items }))
})

/** 工具调用摘要 */
function getToolCallSummary(event: ToolCallEvent): string {
  const input = event.input
  switch (event.toolName) {
    case 'Read':
      return String(input.file_path || input.filePath || '')
    case 'Write':
      return String(input.file_path || input.filePath || '')
    case 'Edit':
      return String(input.file_path || input.filePath || '')
    case 'Bash':
      return truncateStr(String(input.command || ''), 80)
    case 'Grep':
      return `"${input.pattern || ''}" ${input.path || ''}`
    case 'Glob':
      return String(input.pattern || '')
    case 'WebSearch':
      return String(input.query || '')
    default:
      return ''
  }
}

/** 工具结果摘要 */
function getToolResultSummary(event: ToolResultEvent): string {
  if (event.isError) return '执行出错'
  const firstLine = event.output.split('\n')[0] || ''
  return truncateStr(firstLine, 100)
}

function truncateStr(str: string, max: number): string {
  return str.length > max ? str.substring(0, max) + '...' : str
}

function formatJson(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, null, 2)
}

function formatTokens(n: number): string {
  return n.toLocaleString()
}

const formatDuration = formatDurationMs

function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
}
</script>

<style scoped>
.step-event-viewer {
  font-size: 13px;
  line-height: 1.5;
}

.empty-hint {
  color: #909399;
  text-align: center;
  padding: 20px;
}

.code-block {
  background: #f5f7fa;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  padding: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  max-height: 400px;
  overflow-y: auto;
}
.code-block.output {
  background: #f0f9eb;
  border-color: #e1f3d8;
}

/* 初始化 */
.event-init {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: #f4f4f5;
  border-radius: 4px;
  margin-bottom: 12px;
  color: #606266;
  font-size: 12px;
}
.init-icon {
  font-size: 14px;
}
.init-label {
  background: #e9e9eb;
  padding: 2px 8px;
  border-radius: 3px;
}

/* Turn 分组 */
.turn-group {
  margin-bottom: 12px;
  border-left: 3px solid #409eff;
  padding-left: 12px;
}
.turn-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 8px;
  font-size: 13px;
}
.turn-icon {
  font-size: 14px;
}
.turn-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* 事件项 */
.event-item {
  margin-left: 4px;
}

/* 工具调用/结果头部 */
.tool-call-header,
.tool-result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.2s;
}
.tool-call-header {
  background: #ecf5ff;
}
.tool-call-header:hover {
  background: #d9ecff;
}
.tool-result-header {
  background: #f0f9eb;
}
.tool-result-header:hover {
  background: #e1f3d8;
}
.tool-result-header:has(.is-error) {
  background: #fef0f0;
}

.tool-icon {
  font-size: 14px;
  flex-shrink: 0;
}
.result-icon {
  font-size: 12px;
  flex-shrink: 0;
}
.result-icon.is-error {
  color: #f56c6c;
}
.tool-name {
  font-weight: 600;
  color: #303133;
  flex-shrink: 0;
}
.tool-summary {
  color: #606266;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
}
.expand-icon {
  flex-shrink: 0;
  color: #909399;
  font-size: 12px;
}

/* 展开详情 */
.tool-detail {
  margin: 4px 0 4px 28px;
}
.detail-block {
  background: #f5f7fa;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  padding: 8px 12px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 300px;
  overflow-y: auto;
  margin: 0;
}
.detail-block.is-error {
  background: #fef0f0;
  border-color: #fab6b6;
}

/* 文本回复 */
.text-event {
  display: flex;
  gap: 8px;
  padding: 6px 10px;
  background: #fafafa;
  border-radius: 4px;
}
.text-icon {
  font-size: 14px;
  flex-shrink: 0;
  margin-top: 2px;
}
.text-content {
  color: #303133;
  line-height: 1.6;
  flex: 1;
  overflow: hidden;
}
.text-content :deep(code) {
  background: #f0f0f0;
  padding: 1px 4px;
  border-radius: 3px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
}

/* 最终结果 */
.event-result {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 14px;
  border-radius: 4px;
  margin-top: 12px;
  font-size: 13px;
  font-weight: 600;
}
.event-result.is-success {
  background: #f0f9eb;
  border: 1px solid #e1f3d8;
  color: #67c23a;
}
.event-result.is-error {
  background: #fef0f0;
  border: 1px solid #fab6b6;
  color: #f56c6c;
}
.result-meta {
  font-weight: 400;
  color: #909399;
  font-size: 12px;
}

/* 错误事件 */
.event-error {
  margin-top: 8px;
}
</style>
