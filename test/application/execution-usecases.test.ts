/**
 * Execution 用例层单元测试
 *
 * 覆盖 ExecutePipelineUseCase 和 QueryExecutionUseCase 的委托逻辑。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutePipelineUseCase } from '../../src/main/execution/application/ExecutePipelineUseCase';
import { QueryExecutionUseCase } from '../../src/main/execution/application/QueryExecutionUseCase';
import type { PipelineOrchestrator } from '../../src/main/execution/domain/service/PipelineOrchestrator';
import type { ExecutionRepository } from '../../src/main/execution/domain/repository/ExecutionRepository';
import { createMockExecutionRepository, createTestWorkflow, createTestExecution } from '../fixtures';

describe('ExecutePipelineUseCase', () => {
  let orchestrator: PipelineOrchestrator;
  let useCase: ExecutePipelineUseCase;

  beforeEach(() => {
    orchestrator = {
      execute: vi.fn(async () => 'exec-001'),
    } as unknown as PipelineOrchestrator;
    useCase = new ExecutePipelineUseCase(orchestrator);
  });

  it('delegates to orchestrator.execute', async () => {
    const workflow = createTestWorkflow();
    const inputs = { key: 'value' };

    const result = await useCase.execute(workflow, inputs, 'manual');

    expect(orchestrator.execute).toHaveBeenCalledWith(workflow, inputs, 'manual');
    expect(result).toBe('exec-001');
  });

  it('passes scheduled trigger type correctly', async () => {
    const workflow = createTestWorkflow({ schedule: '0 9 * * *' });

    await useCase.execute(workflow, {}, 'scheduled');

    expect(orchestrator.execute).toHaveBeenCalledWith(workflow, {}, 'scheduled');
  });
});

describe('QueryExecutionUseCase', () => {
  let repo: ReturnType<typeof createMockExecutionRepository>;
  let useCase: QueryExecutionUseCase;

  beforeEach(() => {
    repo = createMockExecutionRepository();
    useCase = new QueryExecutionUseCase(repo);
  });

  describe('list', () => {
    it('delegates to repo.findAll without params', () => {
      const executions = [createTestExecution()];
      (repo.findAll as ReturnType<typeof vi.fn>).mockReturnValue(executions);

      const result = useCase.list();

      expect(repo.findAll).toHaveBeenCalledWith(undefined);
      expect(result).toBe(executions);
    });

    it('delegates to repo.findAll with params', () => {
      const params = { workflowId: 'wf-001' };
      useCase.list(params);

      expect(repo.findAll).toHaveBeenCalledWith(params);
    });
  });

  describe('get', () => {
    it('delegates to repo.findByIdWithSteps', () => {
      const execution = createTestExecution({ id: 'exec-002' });
      (repo.findByIdWithSteps as ReturnType<typeof vi.fn>).mockReturnValue(execution);

      const result = useCase.get('exec-002');

      expect(repo.findByIdWithSteps).toHaveBeenCalledWith('exec-002');
      expect(result).toBe(execution);
    });

    it('returns null when execution not found', () => {
      const result = useCase.get('non-existent');

      expect(repo.findByIdWithSteps).toHaveBeenCalledWith('non-existent');
      expect(result).toBeNull();
    });
  });
});
