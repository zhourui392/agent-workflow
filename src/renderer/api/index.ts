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
  Workflow,
  Execution,
  GlobalConfig,
  CreateWorkflowRequest,
  UpdateWorkflowRequest,
  ExecutionListParams,
  ExecutionProgressEvent,
  McpServerConfig
} from '../../main/store/models';

/**
 * 模拟axios响应格式
 */
interface AxiosLikeResponse<T> {
  data: T;
  status: number;
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
export function getWorkflows(): Promise<AxiosLikeResponse<Workflow[]>> {
  return wrapResponse(window.api.getWorkflows());
}

/**
 * 获取单个工作流
 *
 * @param id 工作流ID
 */
export function getWorkflow(id: string): Promise<AxiosLikeResponse<Workflow | null>> {
  return wrapResponse(window.api.getWorkflow(id));
}

/**
 * 创建工作流
 *
 * @param data 创建数据
 */
export function createWorkflow(
  data: CreateWorkflowRequest
): Promise<AxiosLikeResponse<Workflow>> {
  return wrapResponse(window.api.createWorkflow(data));
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
): Promise<AxiosLikeResponse<Workflow | null>> {
  return wrapResponse(window.api.updateWorkflow(id, data));
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
): Promise<AxiosLikeResponse<Workflow | null>> {
  return wrapResponse(window.api.toggleWorkflow(id));
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
  return wrapResponse(window.api.runWorkflow(id, inputs));
}

// ============ Executions API ============

/**
 * 获取执行记录列表
 *
 * @param params 查询参数
 */
export function getExecutions(
  params?: ExecutionListParams
): Promise<AxiosLikeResponse<Execution[]>> {
  return wrapResponse(window.api.getExecutions(params));
}

/**
 * 获取单个执行记录
 *
 * @param id 执行ID
 */
export function getExecution(
  id: string
): Promise<AxiosLikeResponse<Execution | null>> {
  return wrapResponse(window.api.getExecution(id));
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
  mcpServers?: Record<string, McpServerConfig>;
}): Promise<AxiosLikeResponse<{ success: boolean }>> {
  return wrapResponse(window.api.updateConfig(data));
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
  Workflow,
  Execution,
  StepExecution,
  GlobalConfig,
  CreateWorkflowRequest,
  UpdateWorkflowRequest,
  ExecutionListParams,
  ExecutionProgressEvent,
  WorkflowStep,
  WorkflowInput,
  WorkflowLimits,
  WorkflowOutput,
  McpServerConfig,
  ExecutionStatus,
  TriggerType
} from '../../main/store/models';
