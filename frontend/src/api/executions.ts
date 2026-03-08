import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

export interface StepExecutionData {
  id: string
  execution_id: string
  step_index: number
  step_name: string
  status: string
  started_at?: string
  finished_at?: string
  prompt_rendered?: string
  output_text?: string
  tokens_used: number
  model_used?: string
  error_message?: string
}

export interface ExecutionData {
  id: string
  workflow_id: string
  workflow_name: string
  trigger_type: string
  status: string
  started_at?: string
  finished_at?: string
  current_step?: number
  total_steps?: number
  total_tokens: number
  error_message?: string
  step_executions?: StepExecutionData[]
}

export function listExecutions(params?: { workflow_id?: string; status?: string; limit?: number; offset?: number }) {
  return api.get<ExecutionData[]>('/executions', { params })
}

export function getExecution(id: string) {
  return api.get<ExecutionData>(`/executions/${id}`)
}
