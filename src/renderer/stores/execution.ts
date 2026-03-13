import { defineStore } from 'pinia'
import { ref } from 'vue'
import { listExecutions, getExecution } from '@/api/executions'
import type { ExecutionData } from '@/api/executions'

export const useExecutionStore = defineStore('execution', () => {
  const executions = ref<ExecutionData[]>([])
  const currentExecution = ref<ExecutionData | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchExecutions(params?: { workflow_id?: string; status?: string }) {
    loading.value = true
    error.value = null
    try {
      const { data } = await listExecutions(params)
      executions.value = data
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      error.value = '加载执行记录失败: ' + message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchExecution(id: string) {
    loading.value = true
    error.value = null
    try {
      const { data } = await getExecution(id)
      currentExecution.value = data
      return data
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      error.value = '加载执行详情失败: ' + message
      throw e
    } finally {
      loading.value = false
    }
  }

  return { executions, currentExecution, loading, error, fetchExecutions, fetchExecution }
})
