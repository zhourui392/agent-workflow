/**
 * 前端 API 层（HTTP）
 *
 * 基于 axios 调用 Fastify 后端 REST 路由。所有导出函数签名与迁移前
 * （Electron IPC 版本）完全一致，返回 `AxiosLikeResponse<T>`，因此调用方
 * 组件/store 无需修改。
 */

import axios from 'axios';
import type {
  WorkflowDTO,
  ExecutionDTO,
  GlobalConfig,
  CreateWorkflowRequest,
  UpdateWorkflowRequest,
  ExecutionListParams,
  ExecutionProgressEvent,
  SkillDTO
} from '../../main/types';

import {
  subscribeExecutionProgress as wsSubscribe,
  subscribeSkillGeneration as wsSubscribeSkillGeneration,
  type SkillGenerationEvent
} from './websocket';

/**
 * axios 风格响应（保留字段形状以兼容原 IPC 封装）
 */
interface AxiosLikeResponse<T> {
  data: T;
  status: number;
}

const http = axios.create({
  baseURL: '',
  timeout: 60_000,
  headers: { 'Content-Type': 'application/json' }
});

// ============ Workflows API ============

export function getWorkflows(): Promise<AxiosLikeResponse<WorkflowDTO[]>> {
  return http.get<WorkflowDTO[]>('/api/workflows');
}

export function getWorkflow(id: string): Promise<AxiosLikeResponse<WorkflowDTO | null>> {
  return http.get<WorkflowDTO | null>(`/api/workflows/${encodeURIComponent(id)}`);
}

export function createWorkflow(
  data: CreateWorkflowRequest
): Promise<AxiosLikeResponse<WorkflowDTO>> {
  return http.post<WorkflowDTO>('/api/workflows', data);
}

export function updateWorkflow(
  id: string,
  data: UpdateWorkflowRequest
): Promise<AxiosLikeResponse<WorkflowDTO | null>> {
  return http.put<WorkflowDTO | null>(`/api/workflows/${encodeURIComponent(id)}`, data);
}

export function deleteWorkflow(id: string): Promise<AxiosLikeResponse<boolean>> {
  return http.delete<boolean>(`/api/workflows/${encodeURIComponent(id)}`);
}

export function toggleWorkflow(id: string): Promise<AxiosLikeResponse<WorkflowDTO | null>> {
  return http.post<WorkflowDTO | null>(`/api/workflows/${encodeURIComponent(id)}/toggle`);
}

export function cloneWorkflow(id: string): Promise<AxiosLikeResponse<WorkflowDTO | null>> {
  return http.post<WorkflowDTO | null>(`/api/workflows/${encodeURIComponent(id)}/clone`);
}

/**
 * 执行工作流；后端返回 { executionId }，此处解包为字符串以保持原签名。
 */
export async function runWorkflow(
  id: string,
  options?: { inputs?: Record<string, unknown>; workingDirectory?: string }
): Promise<AxiosLikeResponse<string | null>> {
  const resp = await http.post<{ executionId: string | null }>(
    `/api/workflows/${encodeURIComponent(id)}/run`,
    options || {}
  );
  return { data: resp.data?.executionId ?? null, status: resp.status };
}

// ============ Executions API ============

export function getExecutions(
  params?: ExecutionListParams
): Promise<AxiosLikeResponse<ExecutionDTO[]>> {
  return http.get<ExecutionDTO[]>('/api/executions', { params });
}

export function getExecution(
  id: string
): Promise<AxiosLikeResponse<ExecutionDTO | null>> {
  return http.get<ExecutionDTO | null>(`/api/executions/${encodeURIComponent(id)}`);
}

export function getChildExecutions(
  parentExecutionId: string
): Promise<AxiosLikeResponse<ExecutionDTO[]>> {
  return http.get<ExecutionDTO[]>(`/api/executions/${encodeURIComponent(parentExecutionId)}/children`);
}

export function cancelExecution(id: string): Promise<AxiosLikeResponse<boolean>> {
  return http.post<boolean>(`/api/executions/${encodeURIComponent(id)}/cancel`);
}

export function retryExecution(
  executionId: string,
  workingDirectory?: string
): Promise<AxiosLikeResponse<string>> {
  return http.post<string>(
    `/api/executions/${encodeURIComponent(executionId)}/retry`,
    workingDirectory ? { workingDirectory } : {}
  );
}

// ============ Config API ============

export function getConfig(): Promise<AxiosLikeResponse<GlobalConfig>> {
  return http.get<GlobalConfig>('/api/config');
}

export function updateConfig(data: {
  systemPrompt?: string;
  defaultModel?: string;
}): Promise<AxiosLikeResponse<{ success: boolean }>> {
  return http.put<{ success: boolean }>('/api/config', data);
}

// ============ MCP Tools API ============

export interface McpToolDTO {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpServerToolsDTO {
  server: string;
  tools: McpToolDTO[];
  error?: string;
  fetchedAt: number;
}

export function listMcpTools(
  refresh = false
): Promise<AxiosLikeResponse<Record<string, McpServerToolsDTO>>> {
  return http.get<Record<string, McpServerToolsDTO>>('/api/config/mcp/tools', {
    params: refresh ? { refresh: 1 } : undefined
  });
}

export function listMcpToolsByServer(
  server: string,
  refresh = false
): Promise<AxiosLikeResponse<McpServerToolsDTO>> {
  return http.get<McpServerToolsDTO>(
    `/api/config/mcp/tools/${encodeURIComponent(server)}`,
    { params: refresh ? { refresh: 1 } : undefined }
  );
}

export function refreshMcpTools(): Promise<AxiosLikeResponse<{
  success: boolean;
  tools: Record<string, McpServerToolsDTO>;
}>> {
  return http.post<{ success: boolean; tools: Record<string, McpServerToolsDTO> }>(
    '/api/config/mcp/tools/refresh'
  );
}

// ============ Skills API ============

export function getSkills(): Promise<AxiosLikeResponse<SkillDTO[]>> {
  return http.get<SkillDTO[]>('/api/skills');
}

export function getAllSkills(): Promise<AxiosLikeResponse<SkillDTO[]>> {
  return http.get<SkillDTO[]>('/api/skills/all');
}

export function getSkill(id: string): Promise<AxiosLikeResponse<SkillDTO | null>> {
  return http.get<SkillDTO | null>(`/api/skills/${encodeURIComponent(id)}`);
}

export function deleteSkill(id: string): Promise<AxiosLikeResponse<boolean>> {
  return http.delete<boolean>(`/api/skills/${encodeURIComponent(id)}`);
}

export function setSkillEnabled(
  id: string,
  enabled: boolean
): Promise<AxiosLikeResponse<SkillDTO | null>> {
  return http.patch<SkillDTO | null>(
    `/api/skills/${encodeURIComponent(id)}/enabled`,
    { enabled }
  );
}

// ============ Skill Generation API ============

export interface SkillDraftDTO {
  generationId: string;
  status: 'generating' | 'generated' | 'failed';
  draftName?: string;
  draftDir?: string;
  suggestedTests: string[];
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export function generateSkill(
  prompt: string,
  model?: string
): Promise<AxiosLikeResponse<{ generationId: string }>> {
  return http.post<{ generationId: string }>('/api/skills/generate', { prompt, model });
}

export function getSkillDraft(
  generationId: string
): Promise<AxiosLikeResponse<SkillDraftDTO>> {
  return http.get<SkillDraftDTO>(`/api/skills/generate/${encodeURIComponent(generationId)}`);
}

export function verifySkill(
  generationId: string,
  testPrompt: string,
  model?: string
): Promise<AxiosLikeResponse<{ generationId: string }>> {
  return http.post<{ generationId: string }>(
    `/api/skills/generate/${encodeURIComponent(generationId)}/verify`,
    { testPrompt, model }
  );
}

export function saveSkillFromDraft(
  generationId: string,
  enabled?: boolean
): Promise<AxiosLikeResponse<SkillDTO>> {
  return http.post<SkillDTO>(
    `/api/skills/generate/${encodeURIComponent(generationId)}/save`,
    enabled === undefined ? {} : { enabled }
  );
}

export function cancelSkillGeneration(
  generationId: string
): Promise<AxiosLikeResponse<null>> {
  return http.post<null>(`/api/skills/generate/${encodeURIComponent(generationId)}/cancel`);
}

// ============ Real-time Events ============

export function subscribeExecutionProgress(
  callback: (event: ExecutionProgressEvent) => void
): () => void {
  return wsSubscribe(callback);
}

/**
 * 订阅 Skill 生成/验证会话事件。
 * 回调只会收到 `kind === 'skill-generation'` 的消息；按 generationId 再自行过滤。
 */
export function subscribeSkillGeneration(
  callback: (event: SkillGenerationEvent) => void
): () => void {
  return wsSubscribeSkillGeneration(callback);
}

export type { SkillGenerationEvent };

// ============ Re-export types ============

export type {
  WorkflowDTO,
  ExecutionDTO,
  StepExecutionDTO,
  GlobalConfig,
  CreateWorkflowRequest,
  UpdateWorkflowRequest,
  ExecutionListParams,
  ExecutionProgressEvent,
  WorkflowStep,
  AgentStep,
  SubWorkflowStep,
  ForEachConfig,
  WorkflowInput,
  WorkflowLimits,
  WorkflowOutput,
  ExecutionStatus,
  TriggerType,
  SkillDTO
} from '../../main/types';
