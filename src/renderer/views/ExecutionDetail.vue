<template>
  <div class="execution-detail" v-loading="loading">
    <div class="page-header">
      <div class="header-left">
        <h2>执行详情</h2>
        <el-tag v-if="isRunning" type="primary" effect="dark" class="live-indicator">
          <span class="live-dot"></span>
          实时更新中
        </el-tag>
      </div>
      <el-button @click="$router.back()">返回</el-button>
    </div>

    <template v-if="execution">
      <el-card class="summary-card">
        <el-descriptions :column="4" border>
          <el-descriptions-item label="工作流">{{ execution.workflow_name }}</el-descriptions-item>
          <el-descriptions-item label="触发方式">
            <el-tag :type="execution.trigger_type === 'manual' ? '' : 'success'" size="small">
              {{ execution.trigger_type === 'manual' ? '手动' : '定时' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="statusType(execution.status)" size="small">{{ statusLabel(execution.status) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="进度">{{ execution.status === 'success' ? execution.total_steps : (execution.total_steps ? ((execution.current_step ?? 0) + 1) : 0) }}/{{ execution.total_steps || 0 }}</el-descriptions-item>
          <el-descriptions-item label="开始时间">{{ formatDate(execution.started_at) }}</el-descriptions-item>
          <el-descriptions-item label="结束时间">{{ formatDate(execution.finished_at) }}</el-descriptions-item>
          <el-descriptions-item label="耗时">{{ formatDurationLive(execution.started_at, execution.finished_at) }}</el-descriptions-item>
          <el-descriptions-item label="总 Tokens">{{ execution.total_tokens?.toLocaleString() || '0' }}</el-descriptions-item>
        </el-descriptions>
        <div v-if="execution.error_message" style="margin-top: 15px">
          <el-alert :title="execution.error_message" type="error" :closable="false" show-icon />
        </div>
      </el-card>

      <el-card class="steps-card">
        <template #header>步骤详情</template>
        <el-timeline>
          <el-timeline-item
            v-for="step in execution.step_executions"
            :key="step.id"
            :type="timelineType(step.status)"
            :hollow="step.status === 'pending'"
            size="large"
          >
            <el-collapse>
              <el-collapse-item>
                <template #title>
                  <div class="step-title">
                    <span class="step-name">{{ step.step_name }}</span>
                    <el-tag :type="statusType(step.status)" size="small">{{ statusLabel(step.status) }}</el-tag>
                    <el-tag v-if="step.validation_status === 'passed'" type="success" size="small">验证通过</el-tag>
                    <el-tag v-if="step.validation_status === 'failed'" type="danger" size="small">验证失败</el-tag>
                    <span class="step-meta" v-if="step.tokens_used">{{ step.tokens_used.toLocaleString() }} tokens</span>
                    <span class="step-meta" v-if="step.model_used">{{ step.model_used }}</span>
                    <span class="step-meta">{{ formatDurationLive(step.started_at, step.finished_at) }}</span>
                  </div>
                </template>
                <div class="step-content">
                  <div v-if="step.prompt_rendered" class="step-section">
                    <h4>Prompt</h4>
                    <pre class="code-block">{{ step.prompt_rendered }}</pre>
                  </div>
                  <div class="step-section">
                    <h4>执行过程</h4>
                    <StepEventViewer
                      :events="getStepEvents(step)"
                      :outputText="step.output_text"
                    />
                  </div>
                  <div v-if="step.validation_output" class="step-section">
                    <h4>验证结果</h4>
                    <pre class="code-block" :class="step.validation_status === 'passed' ? 'validation-pass' : 'validation-fail'">{{ step.validation_output }}</pre>
                  </div>
                  <div v-if="step.error_message" class="step-section">
                    <el-alert :title="step.error_message" type="error" :closable="false" />
                  </div>
                </div>
              </el-collapse-item>
            </el-collapse>
          </el-timeline-item>
        </el-timeline>
      </el-card>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useExecutionStore } from '@/stores/execution'
import { subscribeExecutionProgress, type ExecutionProgressEvent } from '@/api/index'
import type { ExecutionData, StepExecutionData } from '@/api/executions'
import type { StepEvent } from '../../main/types'
import StepEventViewer from '@/components/StepEventViewer.vue'
import { statusType, statusLabel, timelineType } from '@/utils/statusUtils'
import { formatDate, formatDuration } from '@/utils/dateUtils'

const route = useRoute()
const store = useExecutionStore()
const loading = ref(false)
const execution = ref<ExecutionData | null>(null)
let unsubscribe: (() => void) | null = null
const now = ref(Date.now())
let tickTimer: ReturnType<typeof setInterval> | null = null

/** 实时收集的事件（按 stepIndex 分组），用于运行中的步骤 */
const liveEvents = ref<Map<number, StepEvent[]>>(new Map())

const isRunning = computed(() => execution.value?.status === 'running')

/**
 * 获取步骤的事件列表（优先使用数据库中的历史事件，运行中使用实时收集的事件）
 */
function getStepEvents(step: StepExecutionData): StepEvent[] | undefined {
  if (step.events && step.events.length > 0) {
    return step.events
  }
  return liveEvents.value.get(step.step_index)
}

async function fetchExecutionData() {
  const id = route.params.id as string
  execution.value = await store.fetchExecution(id) || null
}

function handleProgressEvent(event: ExecutionProgressEvent) {
  if (!execution.value || event.executionId !== execution.value.id) {
    return
  }

  // 收集实时流式事件
  if (event.event) {
    const stepIdx = event.stepIndex
    if (!liveEvents.value.has(stepIdx)) {
      liveEvents.value.set(stepIdx, [])
    }
    liveEvents.value.get(stepIdx)!.push(event.event)
    // 触发响应式更新
    liveEvents.value = new Map(liveEvents.value)
  }

  updateStepFromEvent(event)
  updateExecutionStatus(event)
}

function updateStepFromEvent(event: ExecutionProgressEvent) {
  if (!execution.value?.step_executions) {
    return
  }

  const stepIndex = event.stepIndex
  const step = execution.value.step_executions[stepIndex]

  if (!step) {
    return
  }

  step.status = event.status

  if (event.outputText) {
    step.output_text = event.outputText
  }

  if (event.tokensUsed) {
    step.tokens_used = event.tokensUsed
  }

  if (event.errorMessage) {
    step.error_message = event.errorMessage
  }

  if (event.status === 'success' || event.status === 'failed') {
    step.finished_at = new Date().toISOString()
  }
}

function updateExecutionStatus(event: ExecutionProgressEvent) {
  if (!execution.value) {
    return
  }

  execution.value.current_step = event.stepIndex

  if (event.status === 'success' || event.status === 'failed') {
    const allStepsCompleted = execution.value.step_executions?.every(
      s => s.status === 'success' || s.status === 'failed'
    )

    if (allStepsCompleted) {
      fetchExecutionData()
    }
  }
}

onMounted(async () => {
  loading.value = true
  try {
    await fetchExecutionData()
    unsubscribe = subscribeExecutionProgress(handleProgressEvent)
    tickTimer = setInterval(() => { now.value = Date.now() }, 1000)
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  if (unsubscribe) unsubscribe()
  if (tickTimer) clearInterval(tickTimer)
})

function formatDurationLive(start?: string, end?: string) {
  return formatDuration(start, end, now.value)
}
</script>

<style scoped>
.execution-detail { padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header h2 { margin: 0; }
.header-left { display: flex; align-items: center; gap: 12px; }
.live-indicator { display: flex; align-items: center; gap: 6px; }
.live-dot {
  width: 8px;
  height: 8px;
  background: #fff;
  border-radius: 50%;
  animation: pulse 1.5s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.summary-card { margin-bottom: 20px; }
.steps-card { margin-bottom: 20px; }
.step-title { display: flex; align-items: center; gap: 10px; }
.step-name { font-weight: bold; }
.step-meta { font-size: 12px; color: #909399; }
.step-content { padding: 10px 0; }
.step-section { margin-bottom: 15px; }
.step-section h4 { margin: 0 0 8px 0; color: #606266; }
.code-block { background: #f5f7fa; border: 1px solid #e4e7ed; border-radius: 4px; padding: 12px; white-space: pre-wrap; word-break: break-word; font-size: 13px; max-height: 400px; overflow-y: auto; }
.code-block.output { background: #f0f9eb; border-color: #e1f3d8; }
.code-block.validation-pass { background: #f0f9eb; border-color: #b3e19d; }
.code-block.validation-fail { background: #fef0f0; border-color: #fab6b6; }
</style>
