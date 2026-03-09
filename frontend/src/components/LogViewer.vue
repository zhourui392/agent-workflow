<template>
  <div class="log-viewer" ref="containerRef">
    <div v-for="(log, index) in logs" :key="index" :class="['log-item', log.type]">
      <span class="log-time">{{ log.time }}</span>
      <span class="log-content">{{ log.message }}</span>
    </div>
    <div v-if="logs.length === 0" class="log-empty">等待日志...</div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'

interface LogEntry {
  type: string
  time: string
  message: string
}

const props = defineProps<{ logs: LogEntry[] }>()
const containerRef = ref<HTMLElement | null>(null)
const autoScroll = ref(true)

watch(() => props.logs.length, async () => {
  if (autoScroll.value && containerRef.value) {
    await nextTick()
    containerRef.value.scrollTop = containerRef.value.scrollHeight
  }
})
</script>

<style scoped>
.log-viewer {
  height: 400px;
  overflow-y: auto;
  background: #1e1e1e;
  border-radius: 4px;
  padding: 12px;
  font-family: 'Consolas', monospace;
  font-size: 13px;
}
.log-item { padding: 4px 0; display: flex; gap: 12px; }
.log-time { color: #6a9955; white-space: nowrap; }
.log-content { color: #d4d4d4; word-break: break-all; }
.log-item.step_start .log-content { color: #569cd6; font-weight: bold; }
.log-item.step_complete .log-content { color: #4ec9b0; }
.log-item.step_retry .log-content { color: #ce9178; }
.log-item.step_retry_success .log-content { color: #b5cea8; }
.log-item.error .log-content { color: #f14c4c; }
.log-item.execution_complete .log-content { color: #dcdcaa; font-weight: bold; }
.log-empty { color: #808080; text-align: center; padding: 20px; }
</style>
