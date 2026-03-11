<template>
  <div class="workflow-edit">
    <div class="page-header">
      <h2>{{ isEdit ? '编辑工作流' : '新建工作流' }}</h2>
      <div>
        <el-button @click="$router.back()">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
      </div>
    </div>

    <el-form :model="form" label-width="120px" v-loading="loading">
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

      <!-- Steps -->
      <el-card class="section-card">
        <template #header>
          <div class="section-header">
            <span>步骤列表</span>
            <el-button size="small" type="primary" @click="addStep"><el-icon><Plus /></el-icon> 添加步骤</el-button>
          </div>
        </template>
        <div v-for="(step, index) in form.steps" :key="index" class="step-item">
          <div class="step-header">
            <span class="step-number">步骤 {{ index + 1 }}</span>
            <el-button size="small" type="danger" text @click="removeStep(index)" :disabled="form.steps.length <= 1">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
          <el-form-item label="步骤名称">
            <el-input v-model="step.name" placeholder="如: analyze_code" />
          </el-form-item>
          <el-form-item label="Prompt">
            <el-input v-model="step.prompt" type="textarea" :rows="4"
              placeholder="步骤提示词，支持 {{today}}, {{steps.prev_step.output}} 等模板变量" />
          </el-form-item>
          <el-form-item label="最大轮次">
            <el-input-number v-model="step.max_turns" :min="1" :max="100" />
          </el-form-item>
          <el-divider v-if="index < form.steps.length - 1" />
        </div>
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
        <template #header>成本控制</template>
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="Token 上限">
              <el-input-number v-model="limitsMaxTokens" :min="0" :step="10000" />
            </el-form-item>
          </el-col>
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
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
      </el-card>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useWorkflowStore } from '@/stores/workflow'
import { ElMessage } from 'element-plus'
import { Plus, Delete } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const store = useWorkflowStore()
const isEdit = computed(() => route.name === 'WorkflowEdit')
const loading = ref(false)
const saving = ref(false)

const form = reactive({
  id: undefined as string | undefined,
  name: '',
  description: '',
  working_directory: '',
  enabled: true,
  schedule: '',
  steps: [{ name: '', prompt: '', max_turns: 30 }] as any[],
  rules: null as Record<string, any> | null,
  limits: null as Record<string, any> | null,
  on_failure: 'stop',
})

const rulesSystemPrompt = computed({
  get: () => form.rules?.system_prompt || '',
  set: (val: string) => { if (!form.rules) form.rules = {}; form.rules.system_prompt = val }
})
const limitsMaxTokens = computed({
  get: () => form.limits?.max_tokens || 0,
  set: (val: number) => { if (!form.limits) form.limits = {}; form.limits.max_tokens = val || undefined }
})
const limitsMaxDuration = computed({
  get: () => form.limits?.max_duration || 0,
  set: (val: number) => { if (!form.limits) form.limits = {}; form.limits.max_duration = val || undefined }
})

function addStep() { form.steps.push({ name: '', prompt: '', max_turns: 30 }) }
function removeStep(index: number) { form.steps.splice(index, 1) }

async function handleSave() {
  if (!form.name.trim()) { ElMessage.warning('请输入工作流名称'); return }
  if (!form.steps.some((s: any) => s.prompt.trim())) { ElMessage.warning('至少需要一个有效步骤'); return }
  saving.value = true
  try {
    const payload = {
      ...form,
      schedule: form.schedule || null,
      rules: form.rules?.system_prompt ? form.rules : null,
      limits: (form.limits?.max_tokens || form.limits?.max_duration) ? form.limits : null,
      working_directory: form.working_directory || null,
    }
    await store.saveWorkflow(payload)
    ElMessage.success('保存成功')
    router.push('/')
  } catch (e: any) {
    ElMessage.error('保存失败: ' + (e.response?.data?.detail || e.message))
  } finally { saving.value = false }
}

onMounted(async () => {
  if (isEdit.value && route.params.id) {
    loading.value = true
    try {
      const data = await store.fetchWorkflow(route.params.id as string)
      if (data) {
        form.id = data.id; form.name = data.name; form.description = data.description || ''
        form.working_directory = data.working_directory || ''
        form.enabled = data.enabled ?? true; form.schedule = data.schedule || ''
        form.steps = data.steps?.length ? data.steps : [{ name: '', prompt: '', max_turns: 30 }]
        form.rules = data.rules || null; form.limits = data.limits || null
        form.on_failure = data.on_failure || 'stop'
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
.step-item { padding: 10px 0; }
.step-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.step-number { font-weight: bold; color: #409eff; }
.form-tip { font-size: 12px; color: #909399; margin-top: 4px; }
</style>
