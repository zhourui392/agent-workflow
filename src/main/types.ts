/**
 * 公共类型重导出
 *
 * 为渲染进程和 preload 提供统一的类型入口，
 * 避免直接引用各限界上下文内部路径。
 */

// Workflow context
export { Workflow } from './workflow/domain/model';
export type { CreateWorkflowRequest, UpdateWorkflowRequest } from './workflow/domain/model';
export type { WorkflowStep } from './workflow/domain/model/WorkflowStep';
export type { WorkflowInput } from './workflow/domain/model/WorkflowInput';
export type { WorkflowLimits } from './workflow/domain/model/WorkflowLimits';
export type { WorkflowOutput } from './workflow/domain/model/WorkflowOutput';
export type { FailureStrategy } from './workflow/domain/model/FailureStrategy';

// Execution context
export { Execution, StepExecution } from './execution/domain/model';
export type { ExecutionListParams } from './execution/domain/model';
export type { ExecutionStatus, TriggerType } from './execution/domain/model/ExecutionStatus';
export type { StepEvent, StepEventType, InitEvent, TextEvent, ToolCallEvent, ToolResultEvent, TurnEndEvent, ResultEvent, ErrorEvent } from './execution/domain/model/StepEvent';
export type { StepResult, ValidationResult, ExecutionResult, ExecutionProgressEvent } from './execution/domain/model/ExecutionResult';

// Configuration context
export { McpServer, Skill } from './configuration/domain/model';
export type { CreateMcpServerInput, UpdateMcpServerInput, CreateSkillInput, UpdateSkillInput, McpServerConfig, GlobalConfig, MergedConfig, StepMergedConfig } from './configuration/domain/model';
export { SkillWriteError, ConfigReferenceError } from './configuration/domain/model';
export type { ReferenceValidationResult, McpServerStartResult } from './configuration/domain/model';

// ========== IPC DTO 接口 ==========
// IPC 返回的 plain object 类型，解决 class getter 在 structured clone 中丢失的问题。

import type { WorkflowStep } from './workflow/domain/model/WorkflowStep';
import type { WorkflowInput } from './workflow/domain/model/WorkflowInput';
import type { WorkflowLimits } from './workflow/domain/model/WorkflowLimits';
import type { WorkflowOutput } from './workflow/domain/model/WorkflowOutput';
import type { FailureStrategy } from './workflow/domain/model/FailureStrategy';
import type { ExecutionStatus, TriggerType } from './execution/domain/model/ExecutionStatus';
import type { StepEvent } from './execution/domain/model/StepEvent';
import type { McpServerConfig } from './configuration/domain/model';

export interface WorkflowDTO {
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
  onFailure: FailureStrategy;
  createdAt: string;
  updatedAt: string;
}

export interface StepExecutionDTO {
  id: string;
  executionId: string;
  stepIndex: number;
  stepName?: string;
  status: ExecutionStatus;
  startedAt?: string;
  finishedAt?: string;
  promptRendered?: string;
  outputText?: string;
  tokensUsed: number;
  modelUsed?: string;
  errorMessage?: string;
  validationStatus?: 'passed' | 'failed';
  validationOutput?: string;
  events?: StepEvent[];
}

export interface ExecutionDTO {
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
  stepExecutions?: StepExecutionDTO[];
}

export interface McpServerDTO {
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

export interface SkillDTO {
  id: string;
  name: string;
  description?: string;
  allowedTools?: string[];
  content: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
