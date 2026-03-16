/**
 * RetryExecutionUseCase 测试
 *
 * @since 2026/03/17
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RetryExecutionUseCase } from '../../src/main/execution/application/RetryExecutionUseCase';
import { PipelineOrchestrator } from '../../src/main/execution/domain/service/PipelineOrchestrator';
import type { WorkflowLoader } from '../../src/main/execution/domain/service/PipelineOrchestrator';
import {
  createTestExecution,
  createTestStepExecution,
  createMockExecutionRepository,
  createMockStepExecutor,
  createMockProgressNotifier,
  createMockOutputProcessor,
  createMockConfigMergeService,
  createMockWorkflowLoader,
  createTestWorkflowRef
} from '../fixtures';
import { TemplateEngine } from '../../src/main/execution/domain/service/TemplateEngine';
import type { ExecutionRepository } from '../../src/main/execution/domain/repository/ExecutionRepository';

describe('RetryExecutionUseCase', () => {
  let execRepo: ExecutionRepository;
  let orchestrator: PipelineOrchestrator;
  let workflowLoader: WorkflowLoader;
  let useCase: RetryExecutionUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    execRepo = createMockExecutionRepository();
    workflowLoader = createMockWorkflowLoader();
    orchestrator = new PipelineOrchestrator(
      execRepo,
      createMockStepExecutor(),
      createMockConfigMergeService(),
      createMockProgressNotifier(),
      createMockOutputProcessor(),
      new TemplateEngine()
    );
    vi.spyOn(orchestrator, 'retryFromFailedStep').mockResolvedValue('exec-retry-001');
    useCase = new RetryExecutionUseCase(execRepo, orchestrator, workflowLoader);
  });

  it('should reject non-existent execution', async () => {
    vi.mocked(execRepo.findByIdWithSteps).mockReturnValue(null);

    await expect(useCase.retry('non-existent')).rejects.toThrow('执行记录不存在');
  });

  it('should reject non-failed execution', async () => {
    const execution = createTestExecution({ status: 'success' });
    vi.mocked(execRepo.findByIdWithSteps).mockReturnValue(execution);

    await expect(useCase.retry('exec-001')).rejects.toThrow('仅失败的执行可以重试');
  });

  it('should reject when workflow is deleted', async () => {
    const execution = createTestExecution({ status: 'failed' });
    vi.mocked(execRepo.findByIdWithSteps).mockReturnValue(execution);
    vi.mocked(workflowLoader.loadWorkflow).mockReturnValue(null);

    await expect(useCase.retry('exec-001')).rejects.toThrow('工作流已删除，无法重试');
  });

  it('should call orchestrator.retryFromFailedStep with correct arguments', async () => {
    const execution = createTestExecution({
      status: 'failed',
      stepExecutions: [
        createTestStepExecution({ stepIndex: 0, status: 'success', outputText: 'r1' }),
        createTestStepExecution({ stepIndex: 1, status: 'failed' })
      ]
    });
    execution.inputsJson as any; // inputsJson is undefined, inputs will be {}
    vi.mocked(execRepo.findByIdWithSteps).mockReturnValue(execution);

    const workflowRef = createTestWorkflowRef();
    vi.mocked(workflowLoader.loadWorkflow).mockReturnValue(workflowRef);

    const result = await useCase.retry('exec-001');

    expect(result).toBe('exec-retry-001');
    expect(orchestrator.retryFromFailedStep).toHaveBeenCalledWith(
      workflowRef, execution, {}, undefined
    );
  });

  it('should restore inputs from inputsJson', async () => {
    const execution = createTestExecution({ status: 'failed' });
    // Manually set inputsJson via object assignment
    (execution as any).inputsJson = JSON.stringify({ key: 'value' });
    vi.mocked(execRepo.findByIdWithSteps).mockReturnValue(execution);

    const workflowRef = createTestWorkflowRef();
    vi.mocked(workflowLoader.loadWorkflow).mockReturnValue(workflowRef);

    await useCase.retry('exec-001');

    expect(orchestrator.retryFromFailedStep).toHaveBeenCalledWith(
      workflowRef, execution, { key: 'value' }, undefined
    );
  });

  it('should pass RunOptions to orchestrator', async () => {
    const execution = createTestExecution({ status: 'failed' });
    vi.mocked(execRepo.findByIdWithSteps).mockReturnValue(execution);

    const workflowRef = createTestWorkflowRef();
    vi.mocked(workflowLoader.loadWorkflow).mockReturnValue(workflowRef);

    await useCase.retry('exec-001', { workingDirectory: '/custom' });

    expect(orchestrator.retryFromFailedStep).toHaveBeenCalledWith(
      workflowRef, execution, {}, { workingDirectory: '/custom' }
    );
  });
});
