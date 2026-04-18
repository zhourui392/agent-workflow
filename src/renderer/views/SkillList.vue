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
      <el-table-column label="目录" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="dir-text">{{ row.dir_path || '-' }}</span>
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
      <el-table-column label="操作" width="100" align="center">
        <template #default="{ row }">
          <el-button size="small" type="danger" :icon="Delete" @click="handleDelete(row)" />
        </template>
      </el-table-column>
    </el-table>

    <SkillGenerateDialog v-model="generateDialogVisible" @saved="fetchSkills" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { showError } from '@/utils/errorUtils'
import { Plus, Delete } from '@element-plus/icons-vue'
import {
  listSkills,
  deleteSkill,
  setSkillEnabled,
  type SkillData
} from '@/api/skills'
import SkillGenerateDialog from '@/components/SkillGenerateDialog.vue'

const loading = ref(false)
const skills = ref<SkillData[]>([])
const generateDialogVisible = ref(false)

function formatTools(tools: string[] | null): string {
  return tools?.join(', ') || '不限制'
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
  generateDialogVisible.value = true
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

.dir-text {
  font-family: monospace;
  font-size: 12px;
  color: #909399;
}
</style>
