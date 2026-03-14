/**
 * 领域实体 → DTO 转换工具
 *
 * Electron IPC 使用 V8 structured clone 序列化，ES2022 class getter
 * 定义在 prototype 上不被复制。此模块将领域实体显式展开为 plain object，
 * 确保所有 getter 属性在 IPC 传输中不丢失。
 *
 * @author zhourui
 * @since 2026/03/14
 */

import type { Workflow } from '../../workflow/domain/model';
import type { Execution } from '../../execution/domain/model';
import type { StepExecution } from '../../execution/domain/model';
import type { McpServer } from '../../configuration/domain/model';
import type { Skill } from '../../configuration/domain/model';
import type {
  WorkflowDTO,
  ExecutionDTO,
  StepExecutionDTO,
  McpServerDTO,
  SkillDTO
} from '../../types';

export function workflowToDTO(w: Workflow): WorkflowDTO {
  return {
    id: w.id,
    name: w.name,
    enabled: w.enabled,
    schedule: w.schedule,
    inputs: w.inputs,
    steps: w.steps,
    rules: w.rules,
    mcpServers: w.mcpServers,
    skills: w.skills,
    limits: w.limits,
    output: w.output,
    workingDirectory: w.workingDirectory,
    onFailure: w.onFailure,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt
  };
}

export function stepExecutionToDTO(s: StepExecution): StepExecutionDTO {
  return {
    id: s.id,
    executionId: s.executionId,
    stepIndex: s.stepIndex,
    stepName: s.stepName,
    status: s.status,
    startedAt: s.createdAt,
    finishedAt: s.updatedAt !== s.createdAt ? s.updatedAt : undefined,
    promptRendered: s.promptRendered,
    outputText: s.outputText,
    tokensUsed: s.tokensUsed,
    modelUsed: s.modelUsed,
    errorMessage: s.errorMessage,
    validationStatus: s.validationStatus,
    validationOutput: s.validationOutput,
    events: s.events
  };
}

export function executionToDTO(e: Execution): ExecutionDTO {
  return {
    id: e.id,
    workflowId: e.workflowId,
    workflowName: e.workflowName,
    triggerType: e.triggerType,
    status: e.status,
    startedAt: e.createdAt,
    finishedAt: e.finishedAt,
    currentStep: e.currentStep,
    totalSteps: e.totalSteps,
    totalTokens: e.totalTokens,
    errorMessage: e.errorMessage,
    stepExecutions: e.stepExecutions?.map(stepExecutionToDTO)
  };
}

export function mcpServerToDTO(s: McpServer): McpServerDTO {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    command: s.command,
    args: s.args,
    env: s.env,
    enabled: s.enabled,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt
  };
}

export function skillToDTO(s: Skill): SkillDTO {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    allowedTools: s.allowedTools,
    content: s.content,
    enabled: s.enabled,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt
  };
}
