<template>
  <div class="execution-list">
    <div class="page-header">
      <h2>执行历史</h2>
      <el-button @click="handleSearch" :loading="store.loading">
        <el-icon><Refresh /></el-icon> 刷新
      </el-button>
    </div>

    <div class="filter-bar">
      <el-select
        v-model="filter.workflowId"
        placeholder="全部工作流"
        clearable
        filterable
        style="width: 200px"
        @change="handleSearch"
      >
        <el-option
          v-for="w in workflows"
          :key="w.id"
          :label="w.name"
          :value="w.id"
        />
      </el-select>

      <el-select
        v-model="filter.status"
        placeholder="全部状态"
        clearable
        style="width: 140px"
        @change="handleSearch"
      >
        <el-option label="待执行" value="pending" />
        <el-option label="运行中" value="running" />
        <el-option label="成功" value="success" />
        <el-option label="失败" value="failed" />
      </el-select>
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
        <template #default="{ row }">{{ row.status === 'success' ? row.total_steps : (row.total_steps ? (row.current_step + 1) : 0) }}/{{ row.total_steps || 0 }}</template>
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

    <div class="pagination-wrapper">
      <el-pagination
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :total="totalEstimate"
        layout="prev, pager, next"
        @current-change="loadPage"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useExecutionStore } from '@/stores/execution'
import { Refresh } from '@element-plus/icons-vue'
import { statusType, statusLabel } from '@/utils/statusUtils'
import { formatDate, formatDuration } from '@/utils/dateUtils'
import { listWorkflows, type WorkflowData } from '@/api/workflows'

const store = useExecutionStore()
const router = useRouter()

const pageSize = 20
const currentPage = ref(1)
const totalEstimate = ref(0)
const workflows = ref<WorkflowData[]>([])

const filter = reactive({
  workflowId: '' as string,
  status: '' as string,
})

async function loadWorkflows() {
  try {
    const res = await listWorkflows()
    workflows.value = res.data
  } catch {
    // 工作流列表加载失败不影响主功能
  }
}

function handleSearch() {
  currentPage.value = 1
  loadPage(1)
}

async function loadPage(page: number) {
  currentPage.value = page
  const offset = (page - 1) * pageSize
  const params: Record<string, unknown> = { limit: pageSize, offset }

  if (filter.workflowId) {
    params.workflow_id = filter.workflowId
  }
  if (filter.status) {
    params.status = filter.status
  }

  await store.fetchExecutions(params as any)

  if (store.executions.length === pageSize) {
    totalEstimate.value = Math.max(totalEstimate.value, page * pageSize + 1)
  } else {
    totalEstimate.value = (page - 1) * pageSize + store.executions.length
  }
}

onMounted(() => {
  loadWorkflows()
  loadPage(1)
})

function handleRowClick(row: { id: string }) { router.push(`/executions/${row.id}`) }
</script>

<style scoped>
.execution-list { padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.page-header h2 { margin: 0; }
.filter-bar { display: flex; gap: 12px; margin-bottom: 16px; }
.pagination-wrapper { display: flex; justify-content: center; margin-top: 16px; }
</style>
