/**
 * 前端API适配层
 *
 * 将现有的axios HTTP调用适配为Electron IPC调用
 * 保持与原有API相同的接口签名，前端代码无需修改
 *
 * @author zhourui(V33215020)
 * @since 2026/03/11
 */

import type {
  WorkflowDTO,
  ExecutionDTO,
  GlobalConfig,
  CreateWorkflowRequest,
  UpdateWorkflowRequest,
  ExecutionListParams,
  ExecutionProgressEvent,
  SkillDTO,
  CreateSkillInput,
  UpdateSkillInput
} from '../../main/types';

/**
 * 模拟axios响应格式
 */
interface AxiosLikeResponse<T> {
  data: T;
  status: number;
}

/**
 * 深度序列化：剥离 Vue Proxy / class 实例，确保数据能通过 contextBridge structured clone
 *
 * contextBridge 在 preload 函数执行前就对参数做 structured clone，
 * 因此必须在渲染进程侧（调用 window.api 之前）完成序列化。
 */
function toPlain<T>(obj: T): T {
  if (obj === undefined || obj === null) return obj;
  return JSON.parse(JSON.stringify(obj));
}

/**
 * 包装IPC调用为axios风格响应
 *
 * @param promise IPC Promise
 * @returns axios风格的响应
 */
async function wrapResponse<T>(promise: Promise<T>): Promise<AxiosLikeResponse<T>> {
  const data = await promise;
  return { data, status: 200 };
}

// ============ Workflows API ============

/**
 * 获取工作流列表
 */
export function getWorkflows(): Promise<AxiosLikeResponse<WorkflowDTO[]>> {
  return wrapResponse(window.api.getWorkflows());
}

/**
 * 获取单个工作流
 *
 * @param id 工作流ID
 */
export function getWorkflow(id: string): Promise<AxiosLikeResponse<WorkflowDTO | null>> {
  return wrapResponse(window.api.getWorkflow(id));
}

/**
 * 创建工作流
 *
 * @param data 创建数据
 */
export function createWorkflow(
  data: CreateWorkflowRequest
): Promise<AxiosLikeResponse<WorkflowDTO>> {
  return wrapResponse(window.api.createWorkflow(toPlain(data)));
}

/**
 * 更新工作流
 *
 * @param id 工作流ID
 * @param data 更新数据
 */
export function updateWorkflow(
  id: string,
  data: UpdateWorkflowRequest
): Promise<AxiosLikeResponse<WorkflowDTO | null>> {
  return wrapResponse(window.api.updateWorkflow(id, toPlain(data)));
}

/**
 * 删除工作流
 *
 * @param id 工作流ID
 */
export function deleteWorkflow(id: string): Promise<AxiosLikeResponse<boolean>> {
  return wrapResponse(window.api.deleteWorkflow(id));
}

/**
 * 切换工作流启用状态
 *
 * @param id 工作流ID
 */
export function toggleWorkflow(
  id: string
): Promise<AxiosLikeResponse<WorkflowDTO | null>> {
  return wrapResponse(window.api.toggleWorkflow(id));
}

/**
 * 克隆工作流
 *
 * @param id 工作流ID
 */
export function cloneWorkflow(
  id: string
): Promise<AxiosLikeResponse<WorkflowDTO | null>> {
  return wrapResponse(window.api.cloneWorkflow(id));
}

/**
 * 执行工作流
 *
 * @param id 工作流ID
 * @param inputs 输入参数
 */
export function runWorkflow(
  id: string,
  inputs?: Record<string, unknown>
): Promise<AxiosLikeResponse<string | null>> {
  return wrapResponse(window.api.runWorkflow(id, inputs ? toPlain(inputs) : undefined));
}

// ============ Executions API ============

/**
 * 获取执行记录列表
 *
 * @param params 查询参数
 */
export function getExecutions(
  params?: ExecutionListParams
): Promise<AxiosLikeResponse<ExecutionDTO[]>> {
  return wrapResponse(window.api.getExecutions(params ? toPlain(params) : undefined));
}

/**
 * 获取单个执行记录
 *
 * @param id 执行ID
 */
export function getExecution(
  id: string
): Promise<AxiosLikeResponse<ExecutionDTO | null>> {
  return wrapResponse(window.api.getExecution(id));
}

/**
 * 取消执行
 *
 * @param id 执行ID
 */
export function cancelExecution(
  id: string
): Promise<AxiosLikeResponse<boolean>> {
  return wrapResponse(window.api.cancelExecution(id));
}

// ============ Config API ============

/**
 * 获取全局配置
 */
export function getConfig(): Promise<AxiosLikeResponse<GlobalConfig>> {
  return wrapResponse(window.api.getConfig());
}

/**
 * 更新全局配置
 *
 * @param data 配置数据
 */
export function updateConfig(data: {
  systemPrompt?: string;
  defaultModel?: string;
}): Promise<AxiosLikeResponse<{ success: boolean }>> {
  return wrapResponse(window.api.updateConfig(toPlain(data)));
}

// ============ Skills API ============

/**
 * 获取 Skill 列表（仅数据库）
 */
export function getSkills(): Promise<AxiosLikeResponse<SkillDTO[]>> {
  return wrapResponse(window.api.getSkills());
}

/**
 * 获取所有 Skill（数据库 + Claude CLI）
 */
export function getAllSkills(): Promise<AxiosLikeResponse<SkillDTO[]>> {
  return wrapResponse(window.api.getAllSkills());
}

/**
 * 获取单个 Skill
 *
 * @param id Skill ID
 */
export function getSkill(id: string): Promise<AxiosLikeResponse<SkillDTO | null>> {
  return wrapResponse(window.api.getSkill(id));
}

/**
 * 创建 Skill
 *
 * @param data 创建数据
 */
export function createSkill(data: CreateSkillInput): Promise<AxiosLikeResponse<SkillDTO>> {
  return wrapResponse(window.api.createSkill(toPlain(data)));
}

/**
 * 更新 Skill
 *
 * @param id Skill ID
 * @param data 更新数据
 */
export function updateSkill(
  id: string,
  data: UpdateSkillInput
): Promise<AxiosLikeResponse<SkillDTO | null>> {
  return wrapResponse(window.api.updateSkill(id, toPlain(data)));
}

/**
 * 删除 Skill
 *
 * @param id Skill ID
 */
export function deleteSkill(id: string): Promise<AxiosLikeResponse<boolean>> {
  return wrapResponse(window.api.deleteSkill(id));
}

/**
 * 设置 Skill 启用状态
 *
 * @param id Skill ID
 * @param enabled 是否启用
 */
export function setSkillEnabled(
  id: string,
  enabled: boolean
): Promise<AxiosLikeResponse<SkillDTO | null>> {
  return wrapResponse(window.api.setSkillEnabled(id, enabled));
}

// ============ Real-time Events ============

/**
 * 订阅执行进度事件
 *
 * @param callback 回调函数
 * @returns 取消订阅函数
 */
export function subscribeExecutionProgress(
  callback: (event: ExecutionProgressEvent) => void
): () => void {
  return window.api.onExecutionProgress(callback);
}

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
  WorkflowInput,
  WorkflowLimits,
  WorkflowOutput,
  ExecutionStatus,
  TriggerType,
  SkillDTO,
  CreateSkillInput,
  UpdateSkillInput
} from '../../main/types';
