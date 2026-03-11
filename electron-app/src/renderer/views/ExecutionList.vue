<template>
  <div class="execution-list">
    <div class="page-header">
      <h2>执行历史</h2>
      <el-button @click="store.fetchExecutions()" :loading="store.loading">
        <el-icon><Refresh /></el-icon> 刷新
      </el-button>
    </div>

    <el-table :data="store.executions" v-loading="store.loading" stripe @row-click="handleRowClick" style="cursor: pointer; width: 100%">
      <el-table-column prop="workflow_name" label="工作流" min-width="150" />
      <el-table-column label="触发方式" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="row.trigger_type === 'manual' ? '' : 'success'" size="small">
            {{ row.trigger_type === 'manual' ? '手动' : '定时' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)" size="small" :effect="row.status === 'running' ? 'dark' : 'light'">
            {{ statusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="进度" width="100" align="center">
        <template #default="{ row }">{{ row.current_step || 0 }}/{{ row.total_steps || 0 }}</template>
      </el-table-column>
      <el-table-column label="开始时间" width="180">
        <template #default="{ row }">{{ formatDate(row.started_at) }}</template>
      </el-table-column>
      <el-table-column label="耗时" width="100">
        <template #default="{ row }">{{ formatDuration(row.started_at, row.finished_at) }}</template>
      </el-table-column>
      <el-table-column label="Tokens" width="100" align="right">
        <template #default="{ row }">{{ row.total_tokens?.toLocaleString() || '-' }}</template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useExecutionStore } from '@/stores/execution'
import { Refresh } from '@element-plus/icons-vue'

const store = useExecutionStore()
const router = useRouter()

onMounted(() => { store.fetchExecutions() })

function handleRowClick(row: any) { router.push(`/executions/${row.id}`) }

function statusType(status: string) {
  const map: Record<string, string> = { success: 'success', failed: 'danger', running: 'primary', pending: 'info', timeout: 'warning' }
  return map[status] || 'info'
}
function statusLabel(status: string) {
  const map: Record<string, string> = { success: '成功', failed: '失败', running: '运行中', pending: '等待中', timeout: '超时' }
  return map[status] || status
}
function formatDate(dateStr: string) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN')
}
function formatDuration(start: string, end: string) {
  if (!start) return '-'
  const s = new Date(start).getTime()
  const e = end ? new Date(end).getTime() : Date.now()
  const sec = Math.round((e - s) / 1000)
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
}
</script>

<style scoped>
.execution-list { padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header h2 { margin: 0; }
</style>
