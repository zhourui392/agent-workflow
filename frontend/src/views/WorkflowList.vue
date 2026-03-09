<template>
  <div class="workflow-list">
    <div class="page-header">
      <h2>工作流列表</h2>
      <div>
        <el-button @click="triggerImport">
          <el-icon><Upload /></el-icon>
          导入
        </el-button>
        <el-button type="primary" @click="$router.push('/workflows/new')">
          <el-icon><Plus /></el-icon>
          新建工作流
        </el-button>
        <input ref="fileInput" type="file" accept=".json" style="display: none" @change="handleImportFile" />
      </div>
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
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="$router.push(`/workflows/${row.id}`)">编辑</el-button>
          <el-button size="small" type="success" @click="handleRun(row)" :loading="runningId === row.id">运行</el-button>
          <el-button size="small" @click="handleExport(row)">导出</el-button>
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
import { exportWorkflow, importWorkflow } from '@/api/workflows'
import { ElMessage } from 'element-plus'
import { Plus, Upload } from '@element-plus/icons-vue'

const store = useWorkflowStore()
const router = useRouter()
const runningId = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

onMounted(() => { store.fetchWorkflows() })

async function handleToggle(row: any) {
  try {
    await store.toggle(row.id)
    ElMessage.success(row.enabled ? '已启用' : '已停用')
  } catch {
    ElMessage.error('操作失败')
    row.enabled = !row.enabled
  }
}

async function handleRun(row: any) {
  runningId.value = row.id
  try {
    const executionId = await store.run(row.id)
    ElMessage.success('已触发执行')
    router.push(`/executions/${executionId}`)
  } catch (e: any) {
    ElMessage.error('触发失败: ' + (e.response?.data?.detail || e.message))
  } finally {
    runningId.value = null
  }
}

async function handleDelete(row: any) {
  try {
    await store.removeWorkflow(row.id)
    ElMessage.success('已删除')
  } catch {
    ElMessage.error('删除失败')
  }
}

async function handleExport(row: any) {
  try {
    const { data } = await exportWorkflow(row.id)
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${row.name}.json`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('导出成功')
  } catch {
    ElMessage.error('导出失败')
  }
}

function triggerImport() { fileInput.value?.click() }

async function handleImportFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    await importWorkflow(data)
    ElMessage.success('导入成功')
    store.fetchWorkflows()
  } catch (e: any) {
    ElMessage.error('导入失败: ' + (e.response?.data?.detail || e.message))
  } finally {
    if (fileInput.value) fileInput.value.value = ''
  }
}

function formatDate(dateStr: string) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN')
}
</script>

<style scoped>
.workflow-list { padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header h2 { margin: 0; }
.workflow-name { color: #409eff; text-decoration: none; font-weight: 500; }
.workflow-name:hover { text-decoration: underline; }
</style>
