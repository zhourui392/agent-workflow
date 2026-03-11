/**
 * 执行记录API适配层
 *
 * 保持与原有axios API相同的接口签名
 *
 * @author zhourui(V33215020)
 * @since 2026/03/11
 */

import {
  getExecutions,
  getExecution as getExecutionById,
  type Execution,
  type StepExecution
} from './index';

export interface StepExecutionData {
  id: string;
  execution_id: string;
  step_index: number;
  step_name: string;
  status: string;
  started_at?: string;
  finished_at?: string;
  prompt_rendered?: string;
  output_text?: string;
  tokens_used: number;
  model_used?: string;
  error_message?: string;
}

export interface ExecutionData {
  id: string;
  workflow_id: string;
  workflow_name: string;
  trigger_type: string;
  status: string;
  started_at?: string;
  finished_at?: string;
  current_step?: number;
  total_steps?: number;
  total_tokens: number;
  error_message?: string;
  step_executions?: StepExecutionData[];
}

function stepExecutionToData(step: StepExecution, stepName: string): StepExecutionData {
  return {
    id: step.id,
    execution_id: step.executionId,
    step_index: step.stepIndex,
    step_name: stepName,
    status: step.status,
    started_at: step.startedAt,
    finished_at: step.finishedAt,
    prompt_rendered: step.promptRendered,
    output_text: step.outputText,
    tokens_used: step.tokensUsed,
    model_used: step.modelUsed,
    error_message: step.errorMessage
  };
}

function executionToData(execution: Execution): ExecutionData {
  return {
    id: execution.id,
    workflow_id: execution.workflowId,
    workflow_name: '',
    trigger_type: execution.triggerType,
    status: execution.status,
    started_at: execution.startedAt,
    finished_at: execution.finishedAt,
    current_step: execution.currentStep,
    total_steps: execution.stepExecutions?.length,
    total_tokens: execution.totalTokens,
    error_message: execution.errorMessage,
    step_executions: execution.stepExecutions?.map((step, idx) =>
      stepExecutionToData(step, `Step ${idx + 1}`)
    )
  };
}

export async function listExecutions(params?: {
  workflow_id?: string;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const mappedParams = params ? {
    workflowId: params.workflow_id,
    status: params.status as 'pending' | 'running' | 'success' | 'failed' | undefined,
    limit: params.limit,
    offset: params.offset
  } : undefined;

  const response = await getExecutions(mappedParams);
  return {
    data: response.data.map(executionToData)
  };
}

export async function getExecution(id: string) {
  const response = await getExecutionById(id);
  return {
    data: response.data ? executionToData(response.data) : null
  };
}
