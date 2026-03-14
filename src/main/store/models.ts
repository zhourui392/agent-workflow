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
  maxTurns?: number;
  onFailure?: 'stop' | 'skip' | 'retry';
  retryConfig?: {
    maxAttempts?: number;
    delayMs?: number;
  };
  validation?: {
    prompt: string;
  };
  mcpServerIds?: string[];
  skillIds?: string[];
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
    timeoutMs?: number;
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
  workflowName?: string;
  triggerType: TriggerType;
  status: ExecutionStatus;
  startedAt: string;
  finishedAt?: string;
  currentStep: number;
  totalSteps?: number;
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
  /** 步骤名称（从工作流配置中获取） */
  stepName?: string;
  status: ExecutionStatus;
  promptRendered?: string;
  outputText?: string;
  tokensUsed: number;
  modelUsed?: string;
  errorMessage?: string;
  validationStatus?: 'passed' | 'failed';
  validationOutput?: string;
  /** 步骤执行过程中的流式事件列表 */
  events?: StepEvent[];
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
 * 步骤验证结果
 */
export interface ValidationResult {
  passed: boolean;
  output: string;
  tokensUsed: number;
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

// ========== 步骤流式事件类型 ==========

/** 事件类型枚举 */
export type StepEventType =
  | 'init'
  | 'text'
  | 'tool_call'
  | 'tool_result'
  | 'turn_end'
  | 'result'
  | 'error';

/** 初始化事件 */
export interface InitEvent {
  type: 'init';
  tools: string[];
  mcpServers: { name: string; status: string }[];
  model: string;
}

/** 文本回复事件 */
export interface TextEvent {
  type: 'text';
  text: string;
  turnIndex: number;
}

/** 工具调用事件 */
export interface ToolCallEvent {
  type: 'tool_call';
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
  turnIndex: number;
}

/** 工具结果事件 */
export interface ToolResultEvent {
  type: 'tool_result';
  toolUseId: string;
  toolName: string;
  output: string;
  isError: boolean;
  turnIndex: number;
}

/** 一轮结束事件 */
export interface TurnEndEvent {
  type: 'turn_end';
  turnIndex: number;
}

/** 最终结果事件 */
export interface ResultEvent {
  type: 'result';
  success: boolean;
  totalCostUsd: number;
  durationMs: number;
  numTurns: number;
  inputTokens: number;
  outputTokens: number;
}

/** 错误事件 */
export interface ErrorEvent {
  type: 'error';
  message: string;
}

/** 步骤流式事件联合类型 */
export type StepEvent =
  | InitEvent
  | TextEvent
  | ToolCallEvent
  | ToolResultEvent
  | TurnEndEvent
  | ResultEvent
  | ErrorEvent;

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
  /** 细粒度流式事件 */
  event?: StepEvent;
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

// ========== MCP 和 Skills 配置管理 ==========

/**
 * MCP 服务配置项
 *
 * @author zhourui(V33215020)
 * @since 2026/03/12
 */
export interface McpServer {
  id: string;
  name: string;
  description?: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Skill 配置项
 *
 * @author zhourui(V33215020)
 * @since 2026/03/12
 */
export interface Skill {
  id: string;
  name: string;
  description?: string;
  allowedTools?: string[];
  content: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * 创建 MCP 服务输入
 *
 * @author zhourui(V33215020)
 * @since 2026/03/12
 */
export interface CreateMcpServerInput {
  name: string;
  description?: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
}

/**
 * 更新 MCP 服务输入
 *
 * @author zhourui(V33215020)
 * @since 2026/03/12
 */
export interface UpdateMcpServerInput {
  name?: string;
  description?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
}

/**
 * 创建 Skill 输入
 *
 * @author zhourui(V33215020)
 * @since 2026/03/12
 */
export interface CreateSkillInput {
  name: string;
  description?: string;
  allowedTools?: string[];
  content: string;
  enabled?: boolean;
}

/**
 * 更新 Skill 输入
 *
 * @author zhourui(V33215020)
 * @since 2026/03/12
 */
export interface UpdateSkillInput {
  name?: string;
  description?: string;
  allowedTools?: string[];
  content?: string;
  enabled?: boolean;
}
