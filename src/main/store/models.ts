/**
 * 数据模型类型定义
 *
 * @author zhourui(V33215020)
 * @since 2026/03/11
 */

/**
 * 工作流步骤定义
 */
export interface WorkflowStep {
  name: string;
  prompt: string;
  model?: string;
  onFailure?: 'stop' | 'skip' | 'retry';
  retryConfig?: {
    maxAttempts?: number;
    delayMs?: number;
  };
}

/**
 * 工作流输入参数定义
 */
export interface WorkflowInput {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required?: boolean;
  default?: string | number | boolean;
  description?: string;
}

/**
 * 工作流限制配置
 */
export interface WorkflowLimits {
  maxTokens?: number;
  maxTurns?: number;
  timeoutMs?: number;
}

/**
 * 工作流输出配置
 */
export interface WorkflowOutput {
  file?: {
    path: string;
    format?: 'text' | 'json' | 'markdown';
  };
  webhook?: {
    url: string;
    method?: 'POST' | 'PUT';
    headers?: Record<string, string>;
  };
}

/**
 * MCP服务器配置
 */
export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * 工作流实体
 */
export interface Workflow {
  id: string;
  name: string;
  enabled: boolean;
  schedule?: string;
  inputs?: WorkflowInput[];
  steps: WorkflowStep[];
  rules?: string;
  mcpServers?: Record<string, McpServerConfig>;
  skills?: Record<string, string>;
  limits?: WorkflowLimits;
  output?: WorkflowOutput;
  workingDirectory?: string;
  onFailure: 'stop' | 'skip' | 'retry';
  createdAt: string;
  updatedAt: string;
}

/**
 * 执行状态
 */
export type ExecutionStatus = 'pending' | 'running' | 'success' | 'failed';

/**
 * 触发类型
 */
export type TriggerType = 'manual' | 'scheduled';

/**
 * 执行记录实体
 */
export interface Execution {
  id: string;
  workflowId: string;
  triggerType: TriggerType;
  status: ExecutionStatus;
  startedAt: string;
  finishedAt?: string;
  currentStep: number;
  totalTokens: number;
  errorMessage?: string;
  stepExecutions?: StepExecution[];
}

/**
 * 步骤执行记录实体
 */
export interface StepExecution {
  id: string;
  executionId: string;
  stepIndex: number;
  status: ExecutionStatus;
  promptRendered?: string;
  outputText?: string;
  tokensUsed: number;
  modelUsed?: string;
  errorMessage?: string;
  startedAt: string;
  finishedAt?: string;
}

/**
 * 全局配置
 */
export interface GlobalConfig {
  systemPrompt?: string;
  defaultModel?: string;
  mcpServers?: Record<string, McpServerConfig>;
  allowedTools?: string[];
  skills?: Record<string, string>;
}

/**
 * 合并后的配置
 */
export interface MergedConfig {
  systemPrompt?: string;
  model?: string;
  allowedTools?: string[];
  mcpServers?: Record<string, McpServerConfig>;
  skills?: Record<string, string>;
  maxTurns?: number;
  timeoutMs?: number;
  workingDirectory?: string;
}

/**
 * 步骤执行结果
 */
export interface StepResult {
  success: boolean;
  outputText: string;
  tokensUsed: number;
  errorMessage?: string;
}

/**
 * 工作流执行结果
 */
export interface ExecutionResult {
  success: boolean;
  totalTokens: number;
  outputs: Record<string, unknown>;
  errorMessage?: string;
}

/**
 * 执行进度事件
 */
export interface ExecutionProgressEvent {
  executionId: string;
  stepIndex: number;
  status: ExecutionStatus;
  outputText?: string;
  tokensUsed?: number;
  errorMessage?: string;
}

/**
 * 创建工作流请求
 */
export interface CreateWorkflowRequest {
  name: string;
  enabled?: boolean;
  schedule?: string;
  inputs?: WorkflowInput[];
  steps: WorkflowStep[];
  rules?: string;
  mcpServers?: Record<string, McpServerConfig>;
  skills?: Record<string, string>;
  limits?: WorkflowLimits;
  output?: WorkflowOutput;
  workingDirectory?: string;
  onFailure?: 'stop' | 'skip' | 'retry';
}

/**
 * 更新工作流请求
 */
export interface UpdateWorkflowRequest extends Partial<CreateWorkflowRequest> {}

/**
 * 执行列表查询参数
 */
export interface ExecutionListParams {
  workflowId?: string;
  status?: ExecutionStatus;
  limit?: number;
  offset?: number;
}
