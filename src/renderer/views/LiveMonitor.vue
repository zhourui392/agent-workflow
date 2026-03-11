<template>
  <div class="live-monitor">
    <div class="page-header">
      <h2>实时监控</h2>
    </div>

    <el-row :gutter="20">
      <el-col :span="8">
        <el-card class="execution-list-card">
          <template #header>
            <div class="card-header">
              <span>运行中的执行</span>
              <el-button size="small" :icon="Refresh" circle @click="fetchRunning" />
            </div>
          </template>
          <div v-if="runningExecutions.length === 0" class="empty-hint">
            暂无运行中的执行
          </div>
          <div
            v-for="exec in runningExecutions"
            :key="exec.id"
            :class="['exec-item', { active: selectedId === exec.id }]"
            @click="selectExecution(exec)"
          >
            <div class="exec-name">{{ exec.workflow_name }}</div>
            <div class="exec-meta">
              <el-tag size="small" type="warning">运行中</el-tag>
              <span>步骤 {{ exec.current_step }}/{{ exec.total_steps }}</span>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :span="16">
        <el-card>
          <template #header>
            <span>{{ selectedExec ? selectedExec.workflow_name : '选择一个执行查看日志' }}</span>
          </template>
          <LogViewer :logs="logs" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { listExecutions, type ExecutionData } from '@/api/executions'
import { subscribeExecutionProgress, type ExecutionProgressEvent } from '@/api/index'
import LogViewer from '@/components/LogViewer.vue'

interface LogEntry {
  type: string
  time: string
  message: string
}

const runningExecutions = ref<ExecutionData[]>([])
const selectedId = ref<string | null>(null)
const selectedExec = ref<ExecutionData | null>(null)
const logs = ref<LogEntry[]>([])
let unsubscribe: (() => void) | null = null
let pollTimer: number | null = null

async function fetchRunning() {
  try {
    const res = await listExecutions({ status: 'running', limit: 50 })
    runningExecutions.value = res.data
  } catch (e) {
    console.error('Failed to fetch running executions', e)
  }
}

function selectExecution(exec: ExecutionData) {
  if (selectedId.value === exec.id) return
  selectedId.value = exec.id
  selectedExec.value = exec
  logs.value = []
}

function formatLogMessage(event: ExecutionProgressEvent): string {
  const stepNum = event.stepIndex + 1

  if (event.status === 'running' && event.outputText) {
    return `[步骤 ${stepNum}] 输出: ${event.outputText.substring(0, 200)}${event.outputText.length > 200 ? '...' : ''}`
  }

  if (event.status === 'success') {
    const tokens = event.tokensUsed ? `, ${event.tokensUsed} tokens` : ''
    return `[步骤 ${stepNum}] 完成 (成功${tokens})`
  }

  if (event.status === 'failed') {
    return `[步骤 ${stepNum}] 失败: ${event.errorMessage || '未知错误'}`
  }

  return `[步骤 ${stepNum}] 状态: ${event.status}`
}

function handleProgressEvent(event: ExecutionProgressEvent) {
  if (event.executionId !== selectedId.value) {
    return
  }

  const time = new Date().toLocaleTimeString()
  const message = formatLogMessage(event)

  logs.value.push({ type: event.status, time, message })
}

onMounted(() => {
  fetchRunning()
  pollTimer = window.setInterval(fetchRunning, 5000)
  unsubscribe = subscribeExecutionProgress(handleProgressEvent)
})

onUnmounted(() => {
  if (unsubscribe) unsubscribe()
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<style scoped>
.live-monitor { padding: 20px; }
.page-header h2 { margin: 0 0 20px 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.execution-list-card { min-height: 500px; }
.empty-hint { color: #909399; text-align: center; padding: 40px 0; }
.exec-item {
  padding: 12px;
  border-radius: 4px;
  cursor: pointer;
  margin-bottom: 8px;
  background: #f5f7fa;
}
.exec-item:hover { background: #ecf5ff; }
.exec-item.active { background: #ecf5ff; border: 1px solid #409eff; }
.exec-name { font-weight: 500; margin-bottom: 4px; }
.exec-meta { display: flex; gap: 8px; align-items: center; font-size: 12px; color: #909399; }
</style>
