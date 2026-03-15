<template>
  <div class="workflow-edit">
    <div class="page-header">
      <h2>{{ isEdit ? '编辑工作流' : '新建工作流' }}</h2>
      <div>
        <el-button @click="$router.back()">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
      </div>
    </div>

    <el-form :model="form" label-width="120px" v-loading="loading || configLoading">
      <!-- Basic Info -->
      <el-card class="section-card">
        <template #header>基本信息</template>
        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="工作流名称" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" placeholder="工作流描述" />
        </el-form-item>
        <el-form-item label="工作目录">
          <el-input v-model="form.working_directory" placeholder="如: /home/user/project" />
          <div class="form-tip">Claude Agent 执行时的工作目录，留空则使用系统默认目录</div>
        </el-form-item>
      </el-card>

      <!-- Inputs -->
      <el-card class="section-card">
        <template #header>
          <div class="section-header">
            <span>输入参数</span>
            <el-button size="small" type="primary" @click="addInput"><el-icon><Plus /></el-icon> 添加参数</el-button>
          </div>
        </template>
        <el-empty v-if="form.inputs.length === 0" description="暂无输入参数，步骤 Prompt 中可用 {{inputs.xxx}} 引用" :image-size="60" />
        <el-table v-else :data="form.inputs" border size="small">
          <el-table-column label="参数名" min-width="120">
            <template #default="{ row }">
              <el-input v-model="row.name" placeholder="参数名" size="small" />
            </template>
          </el-table-column>
          <el-table-column label="类型" width="120">
            <template #default="{ row }">
              <el-select v-model="row.type" size="small">
                <el-option label="string" value="string" />
                <el-option label="number" value="number" />
                <el-option label="boolean" value="boolean" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="必填" width="70" align="center">
            <template #default="{ row }">
              <el-checkbox v-model="row.required" />
            </template>
          </el-table-column>
          <el-table-column label="默认值" min-width="120">
            <template #default="{ row }">
              <el-switch v-if="row.type === 'boolean'" v-model="row.default" size="small" />
              <el-input-number v-else-if="row.type === 'number'" v-model="row.default" size="small" :controls="false" style="width: 100%" />
              <el-input v-else v-model="row.default" placeholder="默认值" size="small" />
            </template>
          </el-table-column>
          <el-table-column label="描述" min-width="150">
            <template #default="{ row }">
              <el-input v-model="row.description" placeholder="参数描述" size="small" />
            </template>
          </el-table-column>
          <el-table-column label="" width="60" align="center">
            <template #default="{ $index }">
              <el-button size="small" type="danger" text @click="removeInput($index)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <!-- Steps -->
      <el-card class="section-card">
        <template #header>
          <div class="section-header">
            <span>步骤列表</span>
            <el-button size="small" type="primary" @click="addStep"><el-icon><Plus /></el-icon> 添加步骤</el-button>
          </div>
        </template>
        <template v-for="(step, index) in form.steps" :key="index">
          <StepEditor
            :step="step"
            :index="index"
            :skills="skillList"
            :disableRemove="form.steps.length <= 1"
            :workflow-inputs="form.inputs"
            :prior-steps="form.steps.slice(0, index)"
            :available-workflows="otherWorkflows"
            @update:step="form.steps[index] = $event"
            @remove="removeStep(index)"
          />
          <el-divider v-if="index < form.steps.length - 1" />
        </template>
      </el-card>

      <!-- Schedule -->
      <el-card class="section-card">
        <template #header>调度配置</template>
        <el-form-item label="启用调度">
          <el-switch v-model="form.enabled" />
        </el-form-item>
        <el-form-item label="Cron 表达式">
          <el-input v-model="form.schedule" placeholder="如: 0 9 * * 1-5 (工作日每天9点)" />
          <div class="form-tip" v-if="form.schedule">格式: 分 时 日 月 星期</div>
        </el-form-item>
      </el-card>

      <!-- Rules -->
      <el-card class="section-card">
        <template #header>Rules 配置</template>
        <el-form-item label="System Prompt">
          <el-input v-model="rulesSystemPrompt" type="textarea" :rows="4"
            placeholder="工作流级 System Prompt（会追加到全局 System Prompt 之后）" />
        </el-form-item>
      </el-card>

      <!-- Limits -->
      <el-card class="section-card">
        <template #header>执行控制</template>
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="超时(秒)">
              <el-input-number v-model="limitsMaxDuration" :min="0" :step="60" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="失败策略">
              <el-select v-model="form.on_failure">
                <el-option label="停止 (stop)" value="stop" />
                <el-option label="跳过 (skip)" value="skip" />
                <el-option label="重试 (retry)" value="retry" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row v-if="form.on_failure === 'retry'" :gutter="20">
          <el-col :span="8">
            <el-form-item label="最大重试次数">
              <el-input-number v-model="retryMaxAttempts" :min="1" :max="10" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="重试延迟(ms)">
              <el-input-number v-model="retryDelayMs" :min="100" :max="60000" :step="500" />
              <div class="form-tip">首次延迟，后续指数递增</div>
            </el-form-item>
          </el-col>
        </el-row>
      </el-card>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, toRaw } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useWorkflowStore } from '@/stores/workflow'
import { ElMessage } from 'element-plus'
import { Plus, Delete } from '@element-plus/icons-vue'
import { listAllSkills, type SkillData } from '@/api/skills'
import { getWorkflows, type WorkflowDTO } from '@/api/index'
import StepEditor, { type StepFormData } from '@/components/StepEditor.vue'

const route = useRoute()
const router = useRouter()
const store = useWorkflowStore()
const isEdit = computed(() => route.name === 'WorkflowEdit')
const loading = ref(false)
const saving = ref(false)
const configLoading = ref(false)
const skillList = ref<SkillData[]>([])
const allWorkflows = ref<WorkflowDTO[]>([])
const otherWorkflows = computed(() =>
  allWorkflows.value.filter(wf => wf.id !== form.id)
)

const form = reactive({
  id: undefined as string | undefined,
  name: '',
  description: '',
  working_directory: '',
  enabled: true,
  schedule: '',
  inputs: [] as Array<{ name: string; type: 'string' | 'number' | 'boolean'; required: boolean; default?: string | number | boolean; description: string }>,
  steps: [createEmptyStep()] as StepFormData[],
  rules: null as Record<string, any> | null,
  limits: null as Record<string, any> | null,
  on_failure: 'stop',
  retry_config: null as { maxAttempts?: number; delayMs?: number } | null,
})

function createEmptyStep(): StepFormData {
  return {
    name: '',
    prompt: '',
    max_turns: 999,
    validation_enabled: false,
    validation_prompt: '',
    validation_rules: [],
    skill_ids: []
  }
}

const rulesSystemPrompt = computed({
  get: () => form.rules?.system_prompt || '',
  set: (val: string) => { if (!form.rules) form.rules = {}; form.rules.system_prompt = val }
})
const limitsMaxDuration = computed({
  get: () => form.limits?.max_duration || 0,
  set: (val: number) => { if (!form.limits) form.limits = {}; form.limits.max_duration = val || undefined }
})
const retryMaxAttempts = computed({
  get: () => form.retry_config?.maxAttempts || 3,
  set: (val: number) => { if (!form.retry_config) form.retry_config = {}; form.retry_config.maxAttempts = val }
})
const retryDelayMs = computed({
  get: () => form.retry_config?.delayMs || 1000,
  set: (val: number) => { if (!form.retry_config) form.retry_config = {}; form.retry_config.delayMs = val }
})

function addInput() { form.inputs.push({ name: '', type: 'string', required: false, description: '' }) }
function removeInput(index: number) { form.inputs.splice(index, 1) }
function addStep() { form.steps.push(createEmptyStep()) }
function removeStep(index: number) { form.steps.splice(index, 1) }

async function handleSave() {
  if (!form.name.trim()) { ElMessage.warning('请输入工作流名称'); return }
  const hasValidStep = form.steps.some(s =>
    (s.step_type === 'subWorkflow' && s.workflow_id) ||
    (s.step_type === 'dataSplit') ||
    (s.step_type === 'forEach' && s.for_each_iterate_over && s.prompt?.trim()) ||
    (s.prompt && s.prompt.trim())
  )
  if (!hasValidStep) { ElMessage.warning('至少需要一个有效步骤'); return }
  saving.value = true
  try {
    const rawForm = toRaw(form)
    const payload = {
      id: rawForm.id,
      name: rawForm.name,
      description: rawForm.description,
      working_directory: rawForm.working_directory || null,
      enabled: rawForm.enabled,
      schedule: rawForm.schedule || null,
      inputs: rawForm.inputs.length > 0 ? { items: rawForm.inputs.map(i => toRaw(i)) } : undefined,
      steps: rawForm.steps.map(s => {
        const raw = toRaw(s)
        if (raw.step_type === 'subWorkflow') {
          return {
            type: 'subWorkflow' as const,
            name: raw.name,
            workflowId: raw.workflow_id,
            inputMapping: raw.input_mapping && Object.keys(raw.input_mapping).length > 0 ? raw.input_mapping : undefined,
            forEach: raw.for_each_enabled ? {
              iterateOver: raw.for_each_iterate_over || '',
              itemVariable: raw.for_each_item_variable || ''
            } : undefined
          }
        }
        if (raw.step_type === 'dataSplit') {
          return {
            type: 'dataSplit' as const,
            name: raw.name,
            mode: raw.data_split_mode || 'static',
            staticData: raw.data_split_static || undefined,
            templateExpr: raw.data_split_template || undefined,
            aiInput: raw.data_split_ai_input || undefined,
            aiPrompt: raw.data_split_ai_prompt || undefined,
          }
        }
        if (raw.step_type === 'forEach') {
          return {
            type: 'forEach' as const,
            name: raw.name,
            prompt: raw.prompt,
            iterateOver: raw.for_each_iterate_over || '',
            itemVariable: raw.for_each_item_variable || '',
            model: raw.model || undefined,
            maxTurns: raw.max_turns,
            validation: (raw.validation_prompt || (raw.validation_rules && raw.validation_rules.length > 0))
              ? {
                  prompt: raw.validation_prompt || undefined,
                  rules: raw.validation_rules && raw.validation_rules.length > 0 ? raw.validation_rules : undefined
                }
              : undefined,
            skillIds: raw.skill_ids && raw.skill_ids.length > 0 ? raw.skill_ids : undefined
          }
        }
        // Agent step: map form fields to API format, strip internal fields
        const { step_type: _st, workflow_id: _wid, input_mapping: _im,
          for_each_enabled: _fe, for_each_iterate_over: _fio,
          for_each_item_variable: _fiv,
          data_split_mode: _dsm, data_split_static: _dss, data_split_template: _dst,
          data_split_ai_input: _dsai, data_split_ai_prompt: _dsap,
          ...agentFields } = raw
        return agentFields
      }),
      rules: rawForm.rules?.system_prompt ? { ...toRaw(rawForm.rules) } : null,
      limits: rawForm.limits?.max_duration ? { ...toRaw(rawForm.limits) } : undefined,
      on_failure: rawForm.on_failure,
      retry_config: rawForm.on_failure === 'retry' ? toRaw(rawForm.retry_config) : null,
    }
    await store.saveWorkflow(payload)
    ElMessage.success('保存成功')
    router.push('/')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    ElMessage.error('保存失败: ' + msg)
  } finally { saving.value = false }
}

async function loadConfigOptions() {
  configLoading.value = true
  try {
    const [skillRes, wfRes] = await Promise.all([
      listAllSkills(),
      getWorkflows()
    ])
    skillList.value = skillRes.data
    allWorkflows.value = wfRes.data
  } catch (e: unknown) {
    console.error('Failed to load config options:', e)
  } finally {
    configLoading.value = false
  }
}

onMounted(async () => {
  loadConfigOptions()

  if (isEdit.value && route.params.id) {
    loading.value = true
    try {
      const data = await store.fetchWorkflow(route.params.id as string)
      if (data) {
        form.id = data.id; form.name = data.name; form.description = data.description || ''
        form.working_directory = data.working_directory || ''
        form.enabled = data.enabled ?? true; form.schedule = data.schedule || ''
        form.steps = data.steps?.length
          ? data.steps.map((s: Record<string, unknown>) => {
              if (s.type === 'subWorkflow') {
                const forEach = s.forEach as { iterateOver?: string; itemVariable?: string } | undefined
                return {
                  name: String(s.name || ''),
                  prompt: '',
                  max_turns: 999,
                  validation_enabled: false,
                  validation_prompt: '',
                  validation_rules: [],
                  skill_ids: [],
                  step_type: 'subWorkflow' as const,
                  workflow_id: String(s.workflowId || ''),
                  input_mapping: (s.inputMapping as Record<string, string>) || {},
                  for_each_enabled: !!forEach,
                  for_each_iterate_over: forEach?.iterateOver || '',
                  for_each_item_variable: forEach?.itemVariable || ''
                }
              }
              if (s.type === 'forEach') {
                return {
                  name: String(s.name || ''),
                  prompt: String(s.prompt || ''),
                  max_turns: (s.maxTurns as number) || 999,
                  validation_enabled: !!s.validation_prompt || (Array.isArray(s.validation_rules) && s.validation_rules.length > 0),
                  validation_prompt: String((s.validation as Record<string, unknown>)?.prompt || ''),
                  validation_rules: ((s.validation as Record<string, unknown>)?.rules as unknown[]) || [],
                  skill_ids: (s.skillIds as string[]) || [],
                  step_type: 'forEach' as const,
                  for_each_iterate_over: String(s.iterateOver || ''),
                  for_each_item_variable: String(s.itemVariable || '')
                }
              }
              if (s.type === 'dataSplit') {
                return {
                  name: String(s.name || ''),
                  prompt: '',
                  max_turns: 999,
                  validation_enabled: false,
                  validation_prompt: '',
                  validation_rules: [],
                  skill_ids: [],
                  step_type: 'dataSplit' as const,
                  data_split_mode: (s.mode as 'static' | 'template' | 'ai') || 'static',
                  data_split_static: String(s.staticData || ''),
                  data_split_template: String(s.templateExpr || ''),
                  data_split_ai_input: String(s.aiInput || ''),
                  data_split_ai_prompt: String(s.aiPrompt || '')
                }
              }
              return {
                ...s,
                step_type: 'agent' as const,
                validation_enabled: !!s.validation_prompt || (Array.isArray(s.validation_rules) && s.validation_rules.length > 0),
                validation_prompt: s.validation_prompt || '',
                validation_rules: (s.validation_rules as any[]) || [],
                skill_ids: s.skill_ids || []
              }
            })
          : [createEmptyStep()]
        form.inputs = Array.isArray(data.inputs?.items)
          ? data.inputs.items.map((i: Record<string, unknown>) => ({
              name: String(i.name || ''),
              type: (i.type as 'string' | 'number' | 'boolean') || 'string',
              required: !!i.required,
              default: i.default as string | number | boolean | undefined,
              description: String(i.description || '')
            }))
          : []
        form.rules = data.rules || null; form.limits = data.limits || null
        form.on_failure = data.on_failure || 'stop'
        form.retry_config = data.retry_config || null
      }
    } finally { loading.value = false }
  }
})
</script>

<style scoped>
.workflow-edit { padding: 20px; max-width: 900px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header h2 { margin: 0; }
.section-card { margin-bottom: 20px; }
.section-header { display: flex; justify-content: space-between; align-items: center; }
.form-tip { font-size: 12px; color: #909399; margin-top: 4px; }
</style>
