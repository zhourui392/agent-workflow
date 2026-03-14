/**
 * Workflow 测试数据工厂
 *
 * 提供创建 Workflow 领域对象和 WorkflowRepository mock 的工厂函数。
 */

import { vi } from 'vitest';
import { Workflow } from '../../src/main/workflow/domain/model';
import type { WorkflowStep } from '../../src/main/workflow/domain/model';
import type { WorkflowRepository } from '../../src/main/workflow/domain/repository/WorkflowRepository';

/**
 * 创建测试用 Workflow 实例
 *
 * 提供合理默认值：2 个步骤、onFailure='stop'、已启用。
 * 通过 overrides 可覆盖任意字段。
 */
export function createTestWorkflow(overrides: Partial<{
  id: string;
  name: string;
  enabled: boolean;
  schedule: string;
  inputs: Array<{ name: string; type?: string; required?: boolean; default?: string }>;
  steps: WorkflowStep[];
  rules: string;
  mcpServers: Record<string, { command: string; args?: string[]; env?: Record<string, string> }>;
  skills: Record<string, string>;
  limits: { maxTokens?: number; maxTurns?: number; timeoutMs?: number };
  output: unknown;
  workingDirectory: string;
  onFailure: 'stop' | 'skip' | 'retry';
  createdAt: string;
  updatedAt: string;
}> = {}): Workflow {
  const props = {
    id: 'wf-001',
    name: 'Test Workflow',
    enabled: true,
    steps: [
      { name: 'Step 1', prompt: 'Do task 1' },
      { name: 'Step 2', prompt: 'Do task 2 with {{steps.Step 1.output}}' }
    ],
    onFailure: 'stop' as const,
    createdAt: '2026-03-14T00:00:00Z',
    updatedAt: '2026-03-14T00:00:00Z',
    ...overrides
  };
  return new Workflow(props);
}

/**
 * 创建 WorkflowRepository 的 vi.fn() mock
 *
 * 默认行为：
 * - findAll → []
 * - findById → null
 * - findEnabledWithSchedule → []
 * - create → createTestWorkflow()
 * - update → null
 * - toggle → null
 * - remove → false
 */
export function createMockWorkflowRepository(): WorkflowRepository {
  return {
    findAll: vi.fn(() => []),
    findById: vi.fn(() => null),
    findEnabledWithSchedule: vi.fn(() => []),
    create: vi.fn(() => createTestWorkflow()),
    update: vi.fn(() => null),
    toggle: vi.fn(() => null),
    remove: vi.fn(() => false)
  };
}
