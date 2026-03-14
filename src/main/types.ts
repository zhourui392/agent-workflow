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
