/**
 * 工作流API适配层
 *
 * 保持与原有axios API相同的接口签名
 *
 * @author zhourui(V33215020)
 * @since 2026/03/11
 */

import {
  getWorkflows,
  getWorkflow as getWorkflowById,
  createWorkflow as createWorkflowApi,
  updateWorkflow as updateWorkflowApi,
  deleteWorkflow as deleteWorkflowApi,
  toggleWorkflow as toggleWorkflowApi,
  cloneWorkflow as cloneWorkflowApi,
  runWorkflow as runWorkflowApi,
  type WorkflowDTO,
  type WorkflowStep,
  type WorkflowInput,
  type WorkflowLimits,
  type WorkflowOutput
} from './index';

export interface StepConfig {
  name: string;
  prompt: string;
  tools?: string[];
  rules?: Record<string, unknown>;
  model?: string;
  max_turns?: number;
  onFailure?: 'stop' | 'skip' | 'retry';
  retryConfig?: {
    maxAttempts?: number;
    delayMs?: number;
  };
  validation_prompt?: string;
  validation_rules?: Array<{ type: 'regex' | 'contains'; pattern?: string; value?: string }>;
  skill_ids?: string[];
}

export interface WorkflowData {
  id?: string;
  name: string;
  description?: string;
  enabled?: boolean;
  schedule?: string | null;
  inputs?: Record<string, unknown>;
  steps: StepConfig[];
  rules?: string | null;
  skills?: Record<string, string>;
  limits?: Record<string, unknown> | null;
  output?: Record<string, unknown>;
  working_directory?: string | null;
  on_failure?: string;
  retry_config?: { maxAttempts?: number; delayMs?: number } | null;
  created_at?: string;
  updated_at?: string;
}

function workflowToData(workflow: WorkflowDTO): WorkflowData {
  return {
    id: workflow.id,
    name: workflow.name,
    enabled: workflow.enabled,
    schedule: workflow.schedule || null,
    inputs: workflow.inputs ? { items: workflow.inputs } : undefined,
    steps: workflow.steps.map(step => ({
      name: step.name,
      prompt: step.prompt,
      model: step.model,
      max_turns: step.maxTurns,
      onFailure: step.onFailure,
      retryConfig: step.retryConfig,
      validation_prompt: step.validation?.prompt || '',
      validation_rules: step.validation?.rules || [],
      skill_ids: step.skillIds
    })),
    rules: workflow.rules || null,
    skills: workflow.skills,
    limits: workflow.limits as Record<string, unknown> | null,
    output: workflow.output as Record<string, unknown> | undefined,
    working_directory: workflow.workingDirectory || null,
    on_failure: workflow.onFailure,
    retry_config: workflow.retryConfig || null,
    created_at: workflow.createdAt,
    updated_at: workflow.updatedAt
  };
}

function dataToCreateRequest(data: Partial<WorkflowData>) {
  const steps: WorkflowStep[] = (data.steps || []).map(step => ({
    name: step.name,
    prompt: step.prompt,
    model: step.model,
    maxTurns: step.max_turns,
    onFailure: step.onFailure,
    retryConfig: step.retryConfig,
    validation: (step.validation_prompt || (step.validation_rules && step.validation_rules.length > 0))
      ? {
          prompt: step.validation_prompt || undefined,
          rules: step.validation_rules && step.validation_rules.length > 0 ? step.validation_rules : undefined
        }
      : undefined,
    skillIds: step.skill_ids
  }));

  return {
    name: data.name || '',
    enabled: data.enabled,
    schedule: data.schedule || undefined,
    inputs: data.inputs?.items as WorkflowInput[] | undefined,
    steps,
    rules: data.rules || undefined,
    skills: data.skills,
    limits: data.limits ? { ...data.limits } as WorkflowLimits : undefined,
    output: data.output ? { ...data.output } as WorkflowOutput : undefined,
    workingDirectory: data.working_directory || undefined,
    onFailure: (data.on_failure as 'stop' | 'skip' | 'retry') || 'stop',
    retryConfig: data.retry_config || undefined
  };
}

export async function listWorkflows() {
  const response = await getWorkflows();
  return {
    data: response.data.map(workflowToData)
  };
}

export async function getWorkflow(id: string) {
  const response = await getWorkflowById(id);
  return {
    data: response.data ? workflowToData(response.data) : null
  };
}

export async function createWorkflow(data: Partial<WorkflowData>) {
  const request = dataToCreateRequest(data);
  const response = await createWorkflowApi(request);
  return {
    data: workflowToData(response.data)
  };
}

export async function updateWorkflow(id: string, data: Partial<WorkflowData>) {
  const request = dataToCreateRequest(data);
  const response = await updateWorkflowApi(id, request);
  return {
    data: response.data ? workflowToData(response.data) : null
  };
}

export async function deleteWorkflow(id: string) {
  return deleteWorkflowApi(id);
}

export async function toggleWorkflow(id: string) {
  const response = await toggleWorkflowApi(id);
  return {
    data: response.data ? workflowToData(response.data) : null
  };
}

export async function cloneWorkflow(id: string) {
  const response = await cloneWorkflowApi(id);
  return {
    data: response.data ? workflowToData(response.data) : null
  };
}

export async function runWorkflow(id: string, inputs?: Record<string, unknown>) {
  const response = await runWorkflowApi(id, inputs);
  return {
    data: { execution_id: response.data || '' }
  };
}
