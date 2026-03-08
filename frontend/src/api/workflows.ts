import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

export interface StepConfig {
  name: string
  prompt: string
  tools?: string[]
  mcp_servers?: Record<string, any>
  rules?: Record<string, any>
  model?: string
  max_turns?: number
}

export interface WorkflowData {
  id?: string
  name: string
  description?: string
  enabled?: boolean
  schedule?: string | null
  inputs?: Record<string, any>
  steps: StepConfig[]
  rules?: Record<string, any> | null
  mcp_servers?: Record<string, any>
  skills?: Record<string, any>
  limits?: Record<string, any> | null
  output?: Record<string, any>
  on_failure?: string
  created_at?: string
  updated_at?: string
}

export function listWorkflows() {
  return api.get<WorkflowData[]>('/workflows')
}

export function getWorkflow(id: string) {
  return api.get<WorkflowData>(`/workflows/${id}`)
}

export function createWorkflow(data: Partial<WorkflowData>) {
  return api.post<WorkflowData>('/workflows', data)
}

export function updateWorkflow(id: string, data: Partial<WorkflowData>) {
  return api.put<WorkflowData>(`/workflows/${id}`, data)
}

export function deleteWorkflow(id: string) {
  return api.delete(`/workflows/${id}`)
}

export function toggleWorkflow(id: string) {
  return api.patch<WorkflowData>(`/workflows/${id}/toggle`)
}

export function runWorkflow(id: string) {
  return api.post<{ execution_id: string }>(`/workflows/${id}/run`)
}
