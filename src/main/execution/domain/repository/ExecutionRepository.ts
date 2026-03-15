/**
 * 执行记录仓储接口
 *
 * 定义执行记录的持久化契约，由基础设施层实现。
 *
 * @author zhourui
 * @since 2026/03/14
 */

import type { Execution, ExecutionListParams } from '../model';
import type { ExecutionStatus, TriggerType } from '../model/ExecutionStatus';
import type { StepExecution } from '../model/StepExecution';

export interface SubExecutionParams {
  parentExecutionId: string;
  parentStepIndex: number;
  iterationIndex?: number;
}

export interface ExecutionRepository {
  findAll(params?: ExecutionListParams): Execution[];
  findById(id: string): Execution | null;
  findByIdWithSteps(id: string): Execution | null;
  findByParentExecutionId(parentExecutionId: string): Execution[];
  findByParentExecutionIdWithSteps(parentExecutionId: string): Execution[];
  count(params?: ExecutionListParams): number;
  create(workflowId: string, triggerType: TriggerType, subParams?: SubExecutionParams): Execution;
  updateStatus(id: string, status: ExecutionStatus, errorMessage?: string): void;
  updateCurrentStep(id: string, stepIndex: number): void;
  addTokens(id: string, tokens: number): void;
  createStepExecution(executionId: string, stepIndex: number, promptRendered: string): StepExecution;
  updateStepExecution(id: string, data: {
    status?: ExecutionStatus;
    outputText?: string;
    tokensUsed?: number;
    modelUsed?: string;
    errorMessage?: string;
    validationStatus?: 'passed' | 'failed';
    validationOutput?: string;
    eventsJson?: string;
  }): void;
  deleteByWorkflowId(workflowId: string): void;
}
