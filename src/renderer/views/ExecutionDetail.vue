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
      <div class="header-actions">
        <el-popconfirm v-if="isRunning" title="确定取消此执行？" @confirm="handleCancel">
          <template #reference>
            <el-button type="warning" :loading="cancelling">取消执行</el-button>
          </template>
        </el-popconfirm>
        <el-button @click="$router.back()">返回</el-button>
      </div>
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
        <template #header>
          <div class="steps-header">
            <span>步骤详情</span>
            <div class="steps-toolbar" v-if="execution.step_executions?.length">
              <el-button size="small" text @click="expandAllSteps">全部展开</el-button>
              <el-button size="small" text @click="collapseAllSteps">全部折叠</el-button>
            </div>
          </div>
        </template>
        <el-timeline>
          <el-timeline-item
            v-for="step in execution.step_executions"
            :key="step.id"
            :type="timelineType(step.status)"
            :hollow="step.status === 'pending'"
            size="large"
          >
            <el-collapse :model-value="expandedStepIds" @change="handleStepCollapseChange">
              <el-collapse-item :name="step.id">
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
                  <!-- 子执行列表（子工作流步骤） — 内联分层展示 -->
                  <div v-if="childExecutionsMap.get(step.step_index)?.length" class="step-section">
                    <h4>子执行记录</h4>
                    <el-collapse v-model="expandedChildIds">
                      <el-collapse-item
                        v-for="child in childExecutionsMap.get(step.step_index)"
                        :key="child.id"
                        :name="child.id"
                      >
                        <template #title>
                          <div class="child-exec-title">
                            <span class="child-iter" v-if="child.iteration_index != null">#{{ child.iteration_index }}</span>
                            <el-tag :type="statusType(child.status)" size="small">{{ statusLabel(child.status) }}</el-tag>
                            <span class="step-meta">{{ child.total_tokens?.toLocaleString() || 0 }} tokens</span>
                            <span class="step-meta">{{ formatDurationLive(child.started_at, child.finished_at) }}</span>
                          </div>
                        </template>
                        <div class="child-exec-content">
                          <el-timeline v-if="child.step_executions?.length">
                            <el-timeline-item
                              v-for="childStep in child.step_executions"
                              :key="childStep.id"
                              :type="timelineType(childStep.status)"
                              :hollow="childStep.status === 'pending'"
                            >
                              <el-collapse v-model="expandedChildStepIds">
                                <el-collapse-item :name="childStep.id">
                                  <template #title>
                                    <div class="step-title">
                                      <span class="step-name">{{ childStep.step_name }}</span>
                                      <el-tag :type="statusType(childStep.status)" size="small">{{ statusLabel(childStep.status) }}</el-tag>
                                      <span class="step-meta" v-if="childStep.tokens_used">{{ childStep.tokens_used.toLocaleString() }} tokens</span>
                                      <span class="step-meta">{{ formatDurationLive(childStep.started_at, childStep.finished_at) }}</span>
                                    </div>
                                  </template>
                                  <div class="step-content">
                                    <div v-if="childStep.prompt_rendered" class="step-section">
                                      <h4>Prompt</h4>
                                      <pre class="code-block">{{ childStep.prompt_rendered }}</pre>
                                    </div>
                                    <div class="step-section">
                                      <h4>执行过程</h4>
                                      <StepEventViewer :events="getChildStepEvents(childStep)" :outputText="childStep.output_text" />
                                    </div>
                                    <div v-if="childStep.validation_output" class="step-section">
                                      <h4>验证结果</h4>
                                      <pre class="code-block" :class="childStep.validation_status === 'passed' ? 'validation-pass' : 'validation-fail'">{{ childStep.validation_output }}</pre>
                                    </div>
                                    <div v-if="childStep.error_message" class="step-section">
                                      <el-alert :title="childStep.error_message" type="error" :closable="false" />
                                    </div>
                                  </div>
                                </el-collapse-item>
                              </el-collapse>
                            </el-timeline-item>
                          </el-timeline>
                          <div v-else class="empty-hint">暂无步骤记录</div>
                        </div>
                      </el-collapse-item>
                    </el-collapse>
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
import { subscribeExecutionProgress, cancelExecution, getChildExecutions, type ExecutionProgressEvent } from '@/api/index'
import { ElMessage } from 'element-plus'
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

/** 子执行记录（按 parentStepIndex 分组，包含步骤详情） */
const childExecutionsMap = ref<Map<number, ExecutionData[]>>(new Map())

/** 子执行折叠面板展开状态 */
const expandedChildIds = ref<string[]>([])
const expandedChildStepIds = ref<string[]>([])

/** 已知子执行 ID → parentStepIndex 映射（用于匹配无 parentExecutionId 的流式事件） */
const knownChildExecMap = ref<Map<string, number>>(new Map())

/** 子执行的实时流式事件（按 childExecId:stepIndex 分组） */
const liveChildEvents = ref<Map<string, StepEvent[]>>(new Map())

const isRunning = computed(() => execution.value?.status === 'running' || execution.value?.status === 'pending')
const cancelling = ref(false)

async function handleCancel() {
  if (!execution.value) return
  cancelling.value = true
  try {
    await cancelExecution(execution.value.id)
    ElMessage.success('已请求取消')
  } catch (e: unknown) {
    ElMessage.error('取消失败: ' + (e instanceof Error ? e.message : String(e)))
  } finally {
    cancelling.value = false
  }
}

/** 控制步骤折叠面板展开状态 */
const expandedStepIds = ref<string[]>([])

function handleStepCollapseChange(activeNames: string[] | string) {
  expandedStepIds.value = Array.isArray(activeNames) ? activeNames : [activeNames]
}

function expandAllSteps() {
  if (!execution.value?.step_executions) return
  expandedStepIds.value = execution.value.step_executions.map(s => s.id)
}

function collapseAllSteps() {
  expandedStepIds.value = []
}

/**
 * 获取步骤的事件列表
 *
 * 优先返回 liveEvents（实时流式 + 页面加载时从 DB 种子化），
 * 仅在无 liveEvents 时 fallback 到 DB 事件（已完成步骤的历史数据）。
 */
function getStepEvents(step: StepExecutionData): StepEvent[] | undefined {
  const live = liveEvents.value.get(step.step_index)
  if (live && live.length > 0) return live
  if (step.events && step.events.length > 0) return step.events
  return undefined
}

async function fetchExecutionData() {
  const id = route.params.id as string
  execution.value = await store.fetchExecution(id) || null

  // 将 DB 中正在运行步骤的事件种子化到 liveEvents，
  // 这样页面重进后已有事件不丢失，新事件继续追加
  if (execution.value?.step_executions) {
    for (const step of execution.value.step_executions) {
      if (step.status === 'running' && step.events && step.events.length > 0) {
        if (!liveEvents.value.has(step.step_index)) {
          liveEvents.value.set(step.step_index, [...step.events])
        }
      }
    }
  }

  await fetchChildExecutions()
}

async function fetchChildExecutions() {
  if (!execution.value) return
  try {
    const res = await getChildExecutions(execution.value.id)
    const map = new Map<number, ExecutionData[]>()
    for (const dto of res.data) {
      const stepIdx = dto.parentStepIndex ?? -1
      if (!map.has(stepIdx)) map.set(stepIdx, [])
      const childData: ExecutionData = {
        id: dto.id,
        workflow_id: dto.workflowId,
        workflow_name: dto.workflowName || '',
        trigger_type: dto.triggerType,
        status: dto.status,
        started_at: dto.startedAt,
        finished_at: dto.finishedAt,
        current_step: dto.currentStep,
        total_steps: dto.totalSteps ?? dto.stepExecutions?.length ?? 0,
        total_tokens: dto.totalTokens,
        error_message: dto.errorMessage,
        iteration_index: dto.iterationIndex,
        step_executions: dto.stepExecutions?.map(s => ({
          id: s.id,
          execution_id: s.executionId,
          step_index: s.stepIndex,
          step_name: s.stepName || `Step ${s.stepIndex + 1}`,
          status: s.status,
          started_at: s.startedAt,
          finished_at: s.finishedAt,
          prompt_rendered: s.promptRendered,
          output_text: s.outputText,
          tokens_used: s.tokensUsed,
          model_used: s.modelUsed,
          error_message: s.errorMessage,
          validation_status: s.validationStatus,
          validation_output: s.validationOutput,
          events: s.events
        }))
      }
      map.get(stepIdx)!.push(childData)
      // 注册子执行 ID 以匹配后续流式事件
      knownChildExecMap.value.set(dto.id, stepIdx)
      // 将正在运行的子步骤事件种子化到 liveChildEvents
      if (childData.step_executions) {
        for (const cs of childData.step_executions) {
          if (cs.status === 'running' && cs.events && cs.events.length > 0) {
            const key = `${cs.execution_id}:${cs.step_index}`
            if (!liveChildEvents.value.has(key)) {
              liveChildEvents.value.set(key, [...cs.events])
            }
          }
        }
      }
    }
    childExecutionsMap.value = map
  } catch {
    // ignore - child executions are optional
  }
}

/**
 * 确保 step_executions 中存在指定索引的步骤，不存在则创建占位
 */
function ensureStepExists(stepIndex: number): StepExecutionData {
  if (!execution.value) {
    throw new Error('execution is null')
  }
  if (!execution.value.step_executions) {
    execution.value.step_executions = []
  }

  let step = execution.value.step_executions.find(s => s.step_index === stepIndex)
  if (!step) {
    step = {
      id: `live-${stepIndex}`,
      execution_id: execution.value.id,
      step_index: stepIndex,
      step_name: `Step ${stepIndex + 1}`,
      status: 'running',
      started_at: new Date().toISOString(),
      tokens_used: 0
    }
    execution.value.step_executions.push(step)
    execution.value.step_executions.sort((a, b) => a.step_index - b.step_index)
  }
  return step
}

function handleProgressEvent(event: ExecutionProgressEvent) {
  if (!execution.value) return

  // 处理子执行事件（parentExecutionId 匹配当前执行）
  if (event.parentExecutionId === execution.value.id) {
    handleChildProgressEvent(event)
    return
  }

  // 处理已知子执行的流式事件（无 parentExecutionId 但 executionId 在已知子执行列表中）
  if (knownChildExecMap.value.has(event.executionId)) {
    handleChildStreamEvent(event)
    return
  }

  if (event.executionId !== execution.value.id) {
    return
  }

  // 确保执行状态为 running
  if (execution.value.status === 'pending') {
    execution.value.status = 'running'
  }

  // 确保步骤占位存在
  const step = ensureStepExists(event.stepIndex)
  // 自动展开运行中的步骤
  if (!expandedStepIds.value.includes(step.id)) {
    expandedStepIds.value = [...expandedStepIds.value, step.id]
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

  const step = execution.value.step_executions.find(s => s.step_index === event.stepIndex)
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

  if (event.status === 'success' || event.status === 'failed' || event.status === 'cancelled') {
    step.finished_at = new Date().toISOString()
  }
}

function updateExecutionStatus(event: ExecutionProgressEvent) {
  if (!execution.value) {
    return
  }

  execution.value.current_step = event.stepIndex

  if (event.status === 'success' || event.status === 'failed') {
    // 仅当所有已知步骤都完成时才重新加载
    const steps = execution.value.step_executions
    if (steps && steps.length > 0) {
      const allCompleted = steps.every(
        s => s.status === 'success' || s.status === 'failed' || s.status === 'cancelled'
      )
      if (allCompleted) {
        // 清空实时事件，从数据库加载完整数据
        liveEvents.value = new Map()
        fetchExecutionData()
      }
    }
  }
}

/**
 * 处理子执行进度事件
 *
 * 收到子执行的状态变更后，更新 childExecutionsMap 中对应的子执行状态。
 * 子执行完成/失败时，重新从数据库加载完整数据（含步骤详情和事件）。
 */
function handleChildProgressEvent(event: ExecutionProgressEvent) {
  const stepIdx = event.parentStepIndex ?? -1
  const children = childExecutionsMap.value.get(stepIdx)

  // 注册子执行 ID 用于匹配后续流式事件
  knownChildExecMap.value.set(event.executionId, stepIdx)

  if (event.status === 'running' && !children?.find(c => c.id === event.executionId)) {
    // 新子执行开始 — 创建占位
    const child: ExecutionData = {
      id: event.executionId,
      workflow_id: '',
      workflow_name: '',
      trigger_type: 'manual',
      status: 'running',
      started_at: new Date().toISOString(),
      total_tokens: 0,
      iteration_index: event.iterationIndex
    }
    if (!childExecutionsMap.value.has(stepIdx)) {
      childExecutionsMap.value.set(stepIdx, [])
    }
    childExecutionsMap.value.get(stepIdx)!.push(child)
    childExecutionsMap.value = new Map(childExecutionsMap.value)
    // 自动展开子执行面板
    if (!expandedChildIds.value.includes(event.executionId)) {
      expandedChildIds.value = [...expandedChildIds.value, event.executionId]
    }
    return
  }

  // 更新已有子执行状态
  const child = children?.find(c => c.id === event.executionId)
  if (child) {
    child.status = event.status
    if (event.tokensUsed) child.total_tokens = event.tokensUsed
    if (event.errorMessage) child.error_message = event.errorMessage
  }

  // 子执行完成/失败时，重新加载完整数据（含步骤事件）
  if (event.status === 'success' || event.status === 'failed' || event.status === 'cancelled') {
    if (child) child.finished_at = new Date().toISOString()
    // 清除该子执行的实时事件
    for (const key of liveChildEvents.value.keys()) {
      if (key.startsWith(event.executionId + ':')) {
        liveChildEvents.value.delete(key)
      }
    }
    fetchChildExecutions()
  }

  childExecutionsMap.value = new Map(childExecutionsMap.value)
}

/**
 * 处理子执行步骤的流式事件（text、tool_call 等）
 *
 * 这些事件来自 runStep 内部的 broadcastStepEvent，没有 parentExecutionId，
 * 通过 knownChildExecMap 匹配到对应的子执行。
 */
function handleChildStreamEvent(event: ExecutionProgressEvent) {
  const parentStepIdx = knownChildExecMap.value.get(event.executionId)!
  const children = childExecutionsMap.value.get(parentStepIdx)
  const child = children?.find(c => c.id === event.executionId)

  if (!child) return

  // 确保子执行的步骤占位存在
  if (!child.step_executions) child.step_executions = []
  let childStep = child.step_executions.find(s => s.step_index === event.stepIndex)
  if (!childStep) {
    childStep = {
      id: `live-child-${event.executionId}-${event.stepIndex}`,
      execution_id: event.executionId,
      step_index: event.stepIndex,
      step_name: `Step ${event.stepIndex + 1}`,
      status: 'running',
      started_at: new Date().toISOString(),
      tokens_used: 0
    }
    child.step_executions.push(childStep)
    child.step_executions.sort((a, b) => a.step_index - b.step_index)
  }

  // 自动展开子步骤
  if (!expandedChildStepIds.value.includes(childStep.id)) {
    expandedChildStepIds.value = [...expandedChildStepIds.value, childStep.id]
  }

  // 收集流式事件
  if (event.event) {
    const key = `${event.executionId}:${event.stepIndex}`
    if (!liveChildEvents.value.has(key)) {
      liveChildEvents.value.set(key, [])
    }
    liveChildEvents.value.get(key)!.push(event.event)
    liveChildEvents.value = new Map(liveChildEvents.value)
  }

  // 更新步骤状态
  childStep.status = event.status
  if (event.outputText) childStep.output_text = event.outputText
  if (event.tokensUsed) childStep.tokens_used = event.tokensUsed
  if (event.errorMessage) childStep.error_message = event.errorMessage
  if (event.status === 'success' || event.status === 'failed' || event.status === 'cancelled') {
    childStep.finished_at = new Date().toISOString()
  }

  childExecutionsMap.value = new Map(childExecutionsMap.value)
}

/**
 * 获取子执行步骤的事件（优先 DB 数据，运行中用实时收集的事件）
 */
function getChildStepEvents(childStep: StepExecutionData): StepEvent[] | undefined {
  const key = `${childStep.execution_id}:${childStep.step_index}`
  const live = liveChildEvents.value.get(key)
  if (live && live.length > 0) return live
  if (childStep.events && childStep.events.length > 0) return childStep.events
  return undefined
}

onMounted(async () => {
  loading.value = true
  try {
    // 先订阅事件，再加载数据，避免遗漏执行期间的事件
    unsubscribe = subscribeExecutionProgress(handleProgressEvent)
    await fetchExecutionData()
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
.header-actions { display: flex; gap: 8px; }
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
.steps-header { display: flex; justify-content: space-between; align-items: center; width: 100%; }
.steps-toolbar { display: flex; gap: 4px; }
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
.child-exec-title { display: flex; align-items: center; gap: 10px; }
.child-iter { font-weight: bold; color: #409eff; min-width: 24px; }
.child-exec-content { padding: 8px 0 0 12px; border-left: 2px solid #e4e7ed; margin-left: 4px; }
.empty-hint { color: #909399; font-size: 13px; padding: 8px 0; }
</style>
