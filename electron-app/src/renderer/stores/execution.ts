import { defineStore } from 'pinia'
import { ref } from 'vue'
import { listExecutions, getExecution } from '@/api/executions'
import type { ExecutionData } from '@/api/executions'

export const useExecutionStore = defineStore('execution', () => {
  const executions = ref<ExecutionData[]>([])
  const currentExecution = ref<ExecutionData | null>(null)
  const loading = ref(false)

  async function fetchExecutions(params?: { workflow_id?: string; status?: string }) {
    loading.value = true
    try {
      const { data } = await listExecutions(params)
      executions.value = data
    } finally {
      loading.value = false
    }
  }

  async function fetchExecution(id: string) {
    loading.value = true
    try {
      const { data } = await getExecution(id)
      currentExecution.value = data
      return data
    } finally {
      loading.value = false
    }
  }

  return { executions, currentExecution, loading, fetchExecutions, fetchExecution }
})
