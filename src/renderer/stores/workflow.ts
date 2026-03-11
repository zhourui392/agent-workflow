import { defineStore } from 'pinia'
import { ref } from 'vue'
import { listWorkflows, getWorkflow, createWorkflow, updateWorkflow, deleteWorkflow, toggleWorkflow, runWorkflow } from '@/api/workflows'
import type { WorkflowData } from '@/api/workflows'

export const useWorkflowStore = defineStore('workflow', () => {
  const workflows = ref<WorkflowData[]>([])
  const currentWorkflow = ref<WorkflowData | null>(null)
  const loading = ref(false)

  async function fetchWorkflows() {
    loading.value = true
    try {
      const { data } = await listWorkflows()
      workflows.value = data
    } finally {
      loading.value = false
    }
  }

  async function fetchWorkflow(id: string) {
    loading.value = true
    try {
      const { data } = await getWorkflow(id)
      currentWorkflow.value = data
      return data
    } finally {
      loading.value = false
    }
  }

  async function saveWorkflow(workflowData: Partial<WorkflowData>) {
    if (workflowData.id) {
      const { data } = await updateWorkflow(workflowData.id, workflowData)
      return data
    } else {
      const { data } = await createWorkflow(workflowData)
      return data
    }
  }

  async function removeWorkflow(id: string) {
    await deleteWorkflow(id)
    workflows.value = workflows.value.filter((w: WorkflowData) => w.id !== id)
  }

  async function toggle(id: string) {
    const { data } = await toggleWorkflow(id)
    const idx = workflows.value.findIndex((w: WorkflowData) => w.id === id)
    if (idx >= 0 && data) workflows.value[idx] = data
    return data
  }

  async function run(id: string) {
    const { data } = await runWorkflow(id)
    return data.execution_id
  }

  return { workflows, currentWorkflow, loading, fetchWorkflows, fetchWorkflow, saveWorkflow, removeWorkflow, toggle, run }
})
