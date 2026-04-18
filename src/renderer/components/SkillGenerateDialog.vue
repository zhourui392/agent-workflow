<template>
  <el-dialog
    v-model="visible"
    :title="dialogTitle"
    width="720px"
    :close-on-click-modal="false"
    :before-close="handleBeforeClose"
  >
    <el-steps :active="activeStep" finish-status="success" align-center>
      <el-step title="描述需求" />
      <el-step title="AI 生成" />
      <el-step title="测试验证" />
    </el-steps>

    <!-- Step 1: Prompt -->
    <div v-if="phase === 'prompt'" class="step-content">
      <div class="step-hint">
        用自然语言描述这个 Skill 应该做什么，skill-creator 会生成 SKILL.md 与辅助资源。
      </div>
      <el-input
        v-model="promptInput"
        type="textarea"
        :rows="8"
        placeholder="例如：创建一个能读取命令行参数并按 JSON 格式返回系统信息的 skill"
      />
    </div>

    <!-- Step 2: Generating / Generated -->
    <div v-else-if="phase === 'generating' || phase === 'generated'" class="step-content">
      <div class="status-bar">
        <el-tag :type="generatedStatusTag">{{ generatedStatusText }}</el-tag>
        <span v-if="draft?.draftName" class="status-meta">名称：<code>{{ draft.draftName }}</code></span>
      </div>

      <div v-if="generateErrorMessage" class="error-box">{{ generateErrorMessage }}</div>

      <div class="event-log" ref="generateLogRef">
        <div v-for="(item, idx) in generateLog" :key="'g' + idx" class="log-line" :class="item.kind">
          {{ item.text }}
        </div>
        <div v-if="generateLog.length === 0" class="empty-hint">等待 skill-creator 响应…</div>
      </div>

      <div v-if="phase === 'generated' && draft?.suggestedTests?.length" class="suggested-box">
        <div class="suggested-title">建议测试 prompt（点击使用）：</div>
        <div class="suggested-list">
          <el-tag
            v-for="(t, i) in draft.suggestedTests"
            :key="i"
            type="info"
            effect="plain"
            class="suggested-item"
            @click="useSuggestion(t)"
          >{{ t }}</el-tag>
        </div>
      </div>
    </div>

    <!-- Step 3: Verifying / Verified -->
    <div v-else-if="phase === 'verifying' || phase === 'verified'" class="step-content">
      <div class="status-bar">
        <el-tag :type="verifyStatusTag">{{ verifyStatusText }}</el-tag>
        <span class="status-meta">名称：<code>{{ draft?.draftName }}</code></span>
      </div>

      <el-input
        v-model="testPromptInput"
        type="textarea"
        :rows="3"
        placeholder="描述一个验证场景，例如：让 skill 输出当前时间"
        :disabled="phase === 'verifying'"
      />

      <div v-if="verifyErrorMessage" class="error-box">{{ verifyErrorMessage }}</div>

      <div class="event-log" ref="verifyLogRef">
        <div v-for="(item, idx) in verifyLog" :key="'v' + idx" class="log-line" :class="item.kind">
          {{ item.text }}
        </div>
        <div v-if="verifyLog.length === 0" class="empty-hint">点击"执行验证"开始…</div>
      </div>

      <div v-if="verifyResultText" class="result-box">
        <div class="result-title">验证结果：</div>
        <pre class="result-pre">{{ verifyResultText }}</pre>
      </div>
    </div>

    <template #footer>
      <!-- Prompt 阶段 -->
      <template v-if="phase === 'prompt'">
        <el-button @click="handleCancel">取消</el-button>
        <el-button type="primary" :loading="submitting" :disabled="!canSubmitPrompt" @click="handleStartGenerate">开始生成</el-button>
      </template>

      <!-- 生成中 -->
      <template v-else-if="phase === 'generating'">
        <el-button @click="handleCancel">取消生成</el-button>
      </template>

      <!-- 生成完成 -->
      <template v-else-if="phase === 'generated'">
        <el-button @click="handleCancel">放弃</el-button>
        <el-button type="primary" @click="goToVerify">下一步：验证</el-button>
      </template>

      <!-- 验证中 -->
      <template v-else-if="phase === 'verifying'">
        <el-button @click="handleCancel">放弃</el-button>
      </template>

      <!-- 验证完成 -->
      <template v-else-if="phase === 'verified'">
        <el-button @click="handleCancel">放弃</el-button>
        <el-button @click="retryVerify" :disabled="!canRetryVerify">再次验证</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存 Skill</el-button>
      </template>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { showError } from '@/utils/errorUtils'
import {
  generateSkill,
  verifySkill,
  saveSkillFromDraft,
  cancelSkillGeneration,
  subscribeSkillGeneration,
  type SkillDraftDTO,
  type SkillGenerationEvent
} from '@/api/skills'

type Phase = 'prompt' | 'generating' | 'generated' | 'verifying' | 'verified'
type LogKind = 'info' | 'text' | 'tool' | 'error' | 'done'
interface LogLine { kind: LogKind; text: string }

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'saved'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v)
})

const phase = ref<Phase>('prompt')
const promptInput = ref('')
const testPromptInput = ref('')
const submitting = ref(false)
const saving = ref(false)

const generationId = ref<string | null>(null)
const draft = ref<SkillDraftDTO | null>(null)

const generateLog = ref<LogLine[]>([])
const verifyLog = ref<LogLine[]>([])
const generateErrorMessage = ref('')
const verifyErrorMessage = ref('')
const verifyResultText = ref('')
const canRetryVerify = ref(false)

const generateLogRef = ref<HTMLElement | null>(null)
const verifyLogRef = ref<HTMLElement | null>(null)

let unsubscribe: (() => void) | null = null

const dialogTitle = computed(() => {
  switch (phase.value) {
    case 'prompt': return '通过 AI 生成 Skill'
    case 'generating': return 'Skill 生成中…'
    case 'generated': return 'Skill 已生成，准备验证'
    case 'verifying': return 'Skill 验证中…'
    case 'verified': return 'Skill 验证完成'
  }
})

const activeStep = computed(() => {
  switch (phase.value) {
    case 'prompt': return 0
    case 'generating': return 1
    case 'generated': return 2
    case 'verifying': return 2
    case 'verified': return 3
  }
})

const canSubmitPrompt = computed(() => promptInput.value.trim().length > 0)

const generatedStatusTag = computed(() =>
  phase.value === 'generated' ? 'success' : generateErrorMessage.value ? 'danger' : 'info'
)
const generatedStatusText = computed(() => {
  if (phase.value === 'generated') return '生成完成'
  if (generateErrorMessage.value) return '生成失败'
  return '生成中…'
})

const verifyStatusTag = computed(() =>
  phase.value === 'verified' && !verifyErrorMessage.value ? 'success'
    : verifyErrorMessage.value ? 'danger' : 'info'
)
const verifyStatusText = computed(() => {
  if (phase.value === 'verified' && !verifyErrorMessage.value) return '验证完成'
  if (verifyErrorMessage.value) return '验证失败'
  if (phase.value === 'verifying') return '验证中…'
  return '待验证'
})

function reset(): void {
  phase.value = 'prompt'
  promptInput.value = ''
  testPromptInput.value = ''
  submitting.value = false
  saving.value = false
  generationId.value = null
  draft.value = null
  generateLog.value = []
  verifyLog.value = []
  generateErrorMessage.value = ''
  verifyErrorMessage.value = ''
  verifyResultText.value = ''
  canRetryVerify.value = false
  teardownSubscription()
}

function teardownSubscription(): void {
  if (unsubscribe) {
    try { unsubscribe() } catch { /* ignore */ }
    unsubscribe = null
  }
}

watch(visible, v => { if (!v) reset() })

onBeforeUnmount(() => { teardownSubscription() })

async function scrollLogToEnd(ref: HTMLElement | null): Promise<void> {
  await nextTick()
  if (ref) ref.scrollTop = ref.scrollHeight
}

function pushLog(target: LogLine[], line: LogLine, elRef: HTMLElement | null): void {
  target.push(line)
  void scrollLogToEnd(elRef)
}

function describeStepEvent(event: unknown): LogLine | null {
  if (!event || typeof event !== 'object') return null
  const e = event as { type?: string; text?: string; toolName?: string; input?: unknown; output?: string; isError?: boolean; numTurns?: number; model?: string }
  switch (e.type) {
    case 'init':
      return { kind: 'info', text: `[init] 模型=${e.model ?? 'unknown'}` }
    case 'text':
      return { kind: 'text', text: e.text ? `[text] ${e.text.slice(0, 400)}` : '' }
    case 'tool_call':
      return { kind: 'tool', text: `[tool_call] ${e.toolName ?? ''}` }
    case 'tool_result': {
      const flag = e.isError ? '✗' : '✓'
      const out = typeof e.output === 'string' ? e.output.slice(0, 200).replace(/\s+/g, ' ') : ''
      return { kind: e.isError ? 'error' : 'tool', text: `[tool_result ${flag}] ${e.toolName ?? ''} ${out}` }
    }
    case 'turn_end':
      return { kind: 'info', text: `[turn_end]` }
    case 'result':
      return { kind: 'done', text: `[result] turns=${e.numTurns ?? '?'}` }
    case 'error':
      return { kind: 'error', text: `[error] ${(e as { message?: string }).message ?? ''}` }
    default:
      return null
  }
}

function handleSkillEvent(event: SkillGenerationEvent): void {
  if (event.phase === 'generating') {
    if (event.type === 'start') {
      pushLog(generateLog.value, { kind: 'info', text: '[start] 会话开始' }, generateLogRef.value)
      return
    }
    if (event.type === 'step' && event.stepEvent) {
      const line = describeStepEvent(event.stepEvent)
      if (line && line.text) pushLog(generateLog.value, line, generateLogRef.value)
      return
    }
    if (event.type === 'generation_done') {
      const payload = event.payload ?? {}
      draft.value = {
        generationId: event.generationId,
        status: 'generated',
        draftName: (payload.draftName as string | undefined) ?? undefined,
        draftDir: (payload.draftDir as string | undefined) ?? undefined,
        suggestedTests: Array.isArray(payload.suggestedTests) ? payload.suggestedTests as string[] : [],
        createdAt: '',
        updatedAt: ''
      }
      if (draft.value.suggestedTests.length > 0) {
        testPromptInput.value = draft.value.suggestedTests[0]
      }
      phase.value = 'generated'
      pushLog(generateLog.value, { kind: 'done', text: `[generation_done] ${draft.value.draftName ?? ''}` }, generateLogRef.value)
      return
    }
    if (event.type === 'error') {
      generateErrorMessage.value = event.errorMessage ?? '生成失败'
      pushLog(generateLog.value, { kind: 'error', text: `[error] ${generateErrorMessage.value}` }, generateLogRef.value)
      return
    }
  }

  if (event.phase === 'verifying') {
    if (event.type === 'start') {
      canRetryVerify.value = false
      pushLog(verifyLog.value, { kind: 'info', text: '[start] 验证开始' }, verifyLogRef.value)
      return
    }
    if (event.type === 'step' && event.stepEvent) {
      const line = describeStepEvent(event.stepEvent)
      if (line && line.text) pushLog(verifyLog.value, line, verifyLogRef.value)
      return
    }
    if (event.type === 'verification_done') {
      const payload = event.payload ?? {}
      verifyResultText.value = typeof payload.resultText === 'string' ? payload.resultText : ''
      phase.value = 'verified'
      canRetryVerify.value = true
      pushLog(verifyLog.value, { kind: 'done', text: `[verification_done]` }, verifyLogRef.value)
      return
    }
    if (event.type === 'error') {
      verifyErrorMessage.value = event.errorMessage ?? '验证失败'
      phase.value = 'verified'
      canRetryVerify.value = true
      pushLog(verifyLog.value, { kind: 'error', text: `[error] ${verifyErrorMessage.value}` }, verifyLogRef.value)
      return
    }
  }
}

async function handleStartGenerate(): Promise<void> {
  if (!canSubmitPrompt.value) return
  submitting.value = true
  try {
    const res = await generateSkill(promptInput.value.trim())
    const id = res.data.generationId
    generationId.value = id
    phase.value = 'generating'
    generateLog.value = []
    generateErrorMessage.value = ''
    unsubscribe = subscribeSkillGeneration(id, handleSkillEvent)
  } catch (e) {
    showError('启动生成', e)
  } finally {
    submitting.value = false
  }
}

function goToVerify(): void {
  verifyLog.value = []
  verifyErrorMessage.value = ''
  verifyResultText.value = ''
  phase.value = 'verifying'
  void startVerify()
}

async function startVerify(): Promise<void> {
  if (!generationId.value) return
  const testPrompt = testPromptInput.value.trim()
  if (!testPrompt) {
    ElMessage.warning('请先填写测试 prompt')
    phase.value = 'verified'
    canRetryVerify.value = true
    return
  }
  try {
    await verifySkill(generationId.value, testPrompt)
  } catch (e) {
    showError('启动验证', e)
    phase.value = 'verified'
    canRetryVerify.value = true
  }
}

function retryVerify(): void {
  if (!canRetryVerify.value) return
  verifyLog.value = []
  verifyErrorMessage.value = ''
  verifyResultText.value = ''
  phase.value = 'verifying'
  void startVerify()
}

function useSuggestion(text: string): void {
  testPromptInput.value = text
}

async function handleSave(): Promise<void> {
  if (!generationId.value) return
  saving.value = true
  try {
    await saveSkillFromDraft(generationId.value, true)
    ElMessage.success('Skill 已保存')
    emit('saved')
    visible.value = false
  } catch (e) {
    showError('保存 Skill', e)
  } finally {
    saving.value = false
  }
}

async function handleCancel(): Promise<void> {
  if (phase.value === 'prompt') {
    visible.value = false
    return
  }
  try {
    await ElMessageBox.confirm('放弃后将清理临时目录，确定？', '放弃生成', { type: 'warning' })
  } catch {
    return
  }
  if (generationId.value) {
    try { await cancelSkillGeneration(generationId.value) } catch { /* ignore */ }
  }
  visible.value = false
}

function handleBeforeClose(done: () => void): void {
  if (phase.value === 'prompt' || phase.value === 'verified' || generateErrorMessage.value) {
    if (generationId.value) {
      void cancelSkillGeneration(generationId.value).catch(() => { /* ignore */ })
    }
    done()
    return
  }
  ElMessageBox.confirm('会话仍在进行中，关闭将终止并清理。确定？', '关闭', { type: 'warning' })
    .then(() => {
      if (generationId.value) {
        void cancelSkillGeneration(generationId.value).catch(() => { /* ignore */ })
      }
      done()
    })
    .catch(() => { /* stay open */ })
}
</script>

<style scoped>
.step-content {
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.step-hint {
  color: #606266;
  font-size: 13px;
}

.status-bar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-meta {
  font-size: 13px;
  color: #606266;
}

.status-meta code {
  font-family: monospace;
  background: #f5f5f5;
  padding: 2px 6px;
  border-radius: 4px;
}

.event-log {
  background: #1e1e1e;
  color: #d4d4d4;
  font-family: monospace;
  font-size: 12px;
  line-height: 1.6;
  padding: 12px;
  border-radius: 4px;
  max-height: 260px;
  overflow-y: auto;
}

.log-line {
  white-space: pre-wrap;
  word-break: break-word;
}

.log-line.info { color: #9cdcfe; }
.log-line.text { color: #d4d4d4; }
.log-line.tool { color: #ce9178; }
.log-line.error { color: #f48771; }
.log-line.done { color: #6a9955; }

.empty-hint {
  color: #606266;
  font-size: 13px;
}

.error-box {
  background: #fef0f0;
  color: #f56c6c;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 13px;
}

.suggested-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.suggested-title {
  font-size: 13px;
  color: #606266;
}

.suggested-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.suggested-item {
  cursor: pointer;
}

.result-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.result-title {
  font-size: 13px;
  color: #606266;
}

.result-pre {
  background: #f5f7fa;
  padding: 12px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
  max-height: 200px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
