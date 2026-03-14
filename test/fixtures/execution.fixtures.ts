/**
 * Execution 测试数据工厂
 *
 * 提供创建 Execution、StepExecution 领域对象和 ExecutionRepository mock 的工厂函数。
 */

import { vi } from 'vitest';
import { Execution, StepExecution } from '../../src/main/execution/domain/model';
import type { ExecutionStatus, TriggerType } from '../../src/main/execution/domain/model';
import type { ExecutionRepository } from '../../src/main/execution/domain/repository/ExecutionRepository';

/**
 * 创建测试用 Execution 实例
 *
 * 默认值：status='pending', triggerType='manual', currentStep=0, totalTokens=0
 */
export function createTestExecution(overrides: Partial<{
  id: string;
  workflowId: string;
  workflowName: string;
  triggerType: TriggerType;
  status: ExecutionStatus;
  startedAt: string;
  finishedAt: string;
  currentStep: number;
  totalSteps: number;
  totalTokens: number;
  errorMessage: string;
  stepExecutions: StepExecution[];
  updatedAt: string;
}> = {}): Execution {
  const props = {
    id: 'exec-001',
    workflowId: 'wf-001',
    triggerType: 'manual' as TriggerType,
    status: 'pending' as ExecutionStatus,
    startedAt: '2026-03-14T00:00:00Z',
    currentStep: 0,
    totalTokens: 0,
    ...overrides
  };
  return new Execution(props);
}

/**
 * 创建测试用 StepExecution 实例
 *
 * 默认值：stepIndex=0, status='running', tokensUsed=0
 */
export function createTestStepExecution(overrides: Partial<{
  id: string;
  executionId: string;
  stepIndex: number;
  stepName: string;
  status: ExecutionStatus;
  promptRendered: string;
  outputText: string;
  tokensUsed: number;
  modelUsed: string;
  errorMessage: string;
  validationStatus: 'passed' | 'failed';
  validationOutput: string;
  createdAt: string;
  updatedAt: string;
}> = {}): StepExecution {
  const props = {
    id: 'step-exec-001',
    executionId: 'exec-001',
    stepIndex: 0,
    status: 'running' as ExecutionStatus,
    tokensUsed: 0,
    createdAt: '2026-03-14T00:00:00Z',
    updatedAt: '2026-03-14T00:00:00Z',
    ...overrides
  };
  return new StepExecution(props);
}

/**
 * 创建 ExecutionRepository 的 vi.fn() mock
 *
 * 默认行为：
 * - create → createTestExecution()
 * - createStepExecution → createTestStepExecution()
 * - findAll → []
 * - findById → null
 * - findByIdWithSteps → null
 * - count → 0
 */
export function createMockExecutionRepository(): ExecutionRepository {
  return {
    create: vi.fn(() => createTestExecution()),
    updateStatus: vi.fn(),
    updateCurrentStep: vi.fn(),
    createStepExecution: vi.fn(() => createTestStepExecution()),
    updateStepExecution: vi.fn(),
    addTokens: vi.fn(),
    findAll: vi.fn(() => []),
    findById: vi.fn(() => null),
    findByIdWithSteps: vi.fn(() => null),
    count: vi.fn(() => 0),
    deleteByWorkflowId: vi.fn()
  } as unknown as ExecutionRepository;
}
