<template>
  <div class="workflow-list">
    <div class="page-header">
      <h2>工作流列表</h2>
      <el-button type="primary" @click="$router.push('/workflows/new')">
        <el-icon><Plus /></el-icon>
        新建工作流
      </el-button>
    </div>

    <el-table :data="store.workflows" v-loading="store.loading" stripe style="width: 100%">
      <el-table-column prop="name" label="名称" min-width="150">
        <template #default="{ row }">
          <router-link :to="`/workflows/${row.id}`" class="workflow-name">{{ row.name }}</router-link>
        </template>
      </el-table-column>
      <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
      <el-table-column label="调度" width="150">
        <template #default="{ row }">
          <el-tag v-if="row.schedule" size="small">{{ row.schedule }}</el-tag>
          <el-tag v-else type="info" size="small">手动</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="步骤" width="80" align="center">
        <template #default="{ row }">{{ row.steps?.length || 0 }}</template>
      </el-table-column>
      <el-table-column label="启用" width="80" align="center">
        <template #default="{ row }">
          <el-switch v-model="row.enabled" @change="handleToggle(row)" />
        </template>
      </el-table-column>
      <el-table-column label="更新时间" width="180">
        <template #default="{ row }">{{ formatDate(row.updated_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="$router.push(`/workflows/${row.id}`)">编辑</el-button>
          <el-button size="small" type="success" @click="handleRun(row)" :loading="runningId === row.id">运行</el-button>
          <el-popconfirm title="确定删除此工作流？" @confirm="handleDelete(row)">
            <template #reference>
              <el-button size="small" type="danger">删除</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkflowStore } from '@/stores/workflow'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { formatDate } from '@/utils/dateUtils'
import type { WorkflowData } from '@/api/workflows'

const store = useWorkflowStore()
const router = useRouter()
const runningId = ref<string | null>(null)

onMounted(() => { store.fetchWorkflows() })

function extractErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

async function handleToggle(row: WorkflowData) {
  try {
    await store.toggle(row.id)
    ElMessage.success(row.enabled ? '已启用' : '已停用')
  } catch (e: unknown) {
    console.error('Toggle failed:', e)
    ElMessage.error('操作失败: ' + extractErrorMessage(e))
    row.enabled = !row.enabled
  }
}

async function handleRun(row: WorkflowData) {
  runningId.value = row.id
  try {
    const executionId = await store.run(row.id)
    ElMessage.success('已触发执行')
    router.push(`/executions/${executionId}`)
  } catch (e: unknown) {
    ElMessage.error('触发失败: ' + extractErrorMessage(e))
  } finally {
    runningId.value = null
  }
}

async function handleDelete(row: WorkflowData) {
  try {
    await store.removeWorkflow(row.id)
    ElMessage.success('已删除')
  } catch (e: unknown) {
    console.error('Delete failed:', e)
    ElMessage.error('删除失败: ' + extractErrorMessage(e))
  }
}
</script>

<style scoped>
.workflow-list { padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header h2 { margin: 0; }
.workflow-name { color: #409eff; text-decoration: none; font-weight: 500; }
.workflow-name:hover { text-decoration: underline; }
</style>
