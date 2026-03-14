<template>
  <div class="skill-list">
    <div class="page-header">
      <h2>Skills 管理</h2>
      <el-button type="primary" :icon="Plus" @click="handleCreate">新建</el-button>
    </div>

    <el-table :data="skills" v-loading="loading" stripe>
      <el-table-column prop="name" label="名称" width="180" />
      <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
      <el-table-column label="允许工具" min-width="150">
        <template #default="{ row }">
          <span class="tools-text">{{ formatTools(row.allowed_tools) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="全局启用" width="100" align="center">
        <template #default="{ row }">
          <el-switch
            v-model="row.enabled"
            @change="(val: boolean) => handleToggleEnabled(row, val)"
          />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150" align="center">
        <template #default="{ row }">
          <el-button size="small" :icon="Edit" @click="handleEdit(row)" />
          <el-button size="small" type="danger" :icon="Delete" @click="handleDelete(row)" />
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑 Skill' : '新建 Skill'"
      width="700px"
    >
      <el-form :model="form" label-width="100px" :rules="rules" ref="formRef">
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="Skill 名称（唯一标识）" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" placeholder="可选描述" />
        </el-form-item>
        <el-form-item label="允许工具">
          <el-input v-model="form.allowedToolsStr" placeholder="逗号分隔，如 Read, Edit, Bash" />
          <div class="form-tip">限制此 Skill 可使用的工具，留空表示不限制</div>
        </el-form-item>
        <el-form-item label="内容" prop="content">
          <el-input
            v-model="form.content"
            type="textarea"
            :rows="12"
            placeholder="Skill 内容（Markdown 格式）"
          />
        </el-form-item>
        <el-form-item label="全局启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, reactive } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { showError } from '@/utils/errorUtils'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import {
  listSkills,
  createSkill,
  updateSkill,
  deleteSkill,
  setSkillEnabled,
  type SkillData
} from '@/api/skills'

const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const isEdit = ref(false)
const editingId = ref('')
const formRef = ref<FormInstance>()

const skills = ref<SkillData[]>([])

const form = reactive({
  name: '',
  description: '',
  allowedToolsStr: '',
  content: '',
  enabled: false
})

const rules: FormRules = {
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  content: [{ required: true, message: '请输入内容', trigger: 'blur' }]
}

function formatTools(tools: string[] | null): string {
  return tools?.join(', ') || '不限制'
}

function resetForm() {
  form.name = ''
  form.description = ''
  form.allowedToolsStr = ''
  form.content = ''
  form.enabled = false
  editingId.value = ''
}

async function fetchSkills() {
  loading.value = true
  try {
    const res = await listSkills()
    skills.value = res.data
  } catch (e) {
    console.error('Failed to fetch skills', e)
  } finally {
    loading.value = false
  }
}

function handleCreate() {
  resetForm()
  isEdit.value = false
  dialogVisible.value = true
}

function handleEdit(row: SkillData) {
  resetForm()
  isEdit.value = true
  editingId.value = row.id
  form.name = row.name
  form.description = row.description || ''
  form.allowedToolsStr = row.allowed_tools?.join(', ') || ''
  form.content = row.content
  form.enabled = row.enabled
  dialogVisible.value = true
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    const allowedTools = form.allowedToolsStr
      ? form.allowedToolsStr.split(',').map(s => s.trim()).filter(Boolean)
      : undefined

    const data = {
      name: form.name,
      description: form.description || undefined,
      allowed_tools: allowedTools,
      content: form.content,
      enabled: form.enabled
    }

    if (isEdit.value) {
      await updateSkill(editingId.value, data)
      ElMessage.success('更新成功')
    } else {
      await createSkill(data)
      ElMessage.success('创建成功')
    }

    dialogVisible.value = false
    fetchSkills()
  } catch (e: unknown) {
    showError(isEdit.value ? '更新 Skill' : '创建 Skill', e)
  } finally {
    submitting.value = false
  }
}

async function handleDelete(row: SkillData) {
  try {
    await ElMessageBox.confirm(`确定删除 Skill "${row.name}" 吗？`, '确认删除', {
      type: 'warning'
    })
    await deleteSkill(row.id)
    ElMessage.success('删除成功')
    fetchSkills()
  } catch (e: unknown) {
    if (e !== 'cancel') {
      showError('删除 Skill', e)
    }
  }
}

async function handleToggleEnabled(row: SkillData, enabled: boolean) {
  try {
    await setSkillEnabled(row.id, enabled)
    ElMessage.success(enabled ? '已启用' : '已禁用')
  } catch (e: unknown) {
    row.enabled = !enabled
    showError('切换 Skill 状态', e)
  }
}

onMounted(fetchSkills)
</script>

<style scoped>
.skill-list {
  padding: 20px;
  max-width: 1200px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
}

.tools-text {
  font-family: monospace;
  color: #606266;
}

.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}
</style>
