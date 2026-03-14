/**
 * Pipeline 编排器测试
 *
 * @author zhourui(V33215020)
 * @since 2026/03/14
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PipelineOrchestrator } from '../src/main/execution/domain/service/PipelineOrchestrator';
import type { StepExecutor, ProgressNotifier, OutputProcessor } from '../src/main/execution/domain/service/PipelineOrchestrator';
import type { ConfigMergeService } from '../src/main/configuration/domain/service/ConfigMergeService';
import { TemplateEngine } from '../src/main/execution/domain/service/TemplateEngine';
import {
  createTestWorkflow,
  createMockExecutionRepository,
  createMockStepExecutor,
  createMockProgressNotifier,
  createMockOutputProcessor,
  createMockConfigMergeService
} from './fixtures';

describe('PipelineOrchestrator', () => {
  let execRepo: ExecutionRepository;
  let stepExecutor: StepExecutor;
  let configService: ConfigMergeService;
  let notifier: ProgressNotifier;
  let outputProcessor: OutputProcessor;
  let orchestrator: PipelineOrchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    execRepo = createMockExecutionRepository();
    stepExecutor = createMockStepExecutor();
    configService = createMockConfigMergeService();
    notifier = createMockProgressNotifier();
    outputProcessor = createMockOutputProcessor();
    orchestrator = new PipelineOrchestrator(
      execRepo, stepExecutor, configService, notifier, outputProcessor, new TemplateEngine()
    );
  });

  it('should create execution and return execution ID', async () => {
    const workflow = createTestWorkflow();
    const executionId = await orchestrator.execute(workflow, {}, 'manual');
    expect(executionId).toBe('exec-001');
    expect(execRepo.create).toHaveBeenCalledWith('wf-001', 'manual');
  });

  it('should execute all steps in order', async () => {
    const workflow = createTestWorkflow();
    await orchestrator.execute(workflow, {}, 'manual');

    await vi.waitFor(() => {
      expect(execRepo.updateStatus).toHaveBeenCalledWith('exec-001', 'success');
    }, { timeout: 2000 });

    expect(execRepo.updateStatus).toHaveBeenCalledWith('exec-001', 'running');
    expect(execRepo.createStepExecution).toHaveBeenCalledTimes(2);
    expect(stepExecutor.execute).toHaveBeenCalledTimes(2);
  });

  it('should stop pipeline when step fails with onFailure=stop', async () => {
    vi.mocked(stepExecutor.execute).mockResolvedValueOnce({
      success: false, outputText: '', tokensUsed: 50, errorMessage: 'step failed'
    });

    const workflow = createTestWorkflow({ onFailure: 'stop' });
    await orchestrator.execute(workflow, {}, 'manual');

    await vi.waitFor(() => {
      expect(execRepo.updateStatus).toHaveBeenCalledWith('exec-001', 'failed', 'step failed');
    }, { timeout: 2000 });

    expect(stepExecutor.execute).toHaveBeenCalledTimes(1);
  });

  it('should skip failed step with onFailure=skip', async () => {
    vi.mocked(stepExecutor.execute)
      .mockResolvedValueOnce({ success: false, outputText: '', tokensUsed: 50, errorMessage: 'step failed' })
      .mockResolvedValueOnce({ success: true, outputText: 'step 2 output', tokensUsed: 100 });

    const workflow = createTestWorkflow({ onFailure: 'skip' });
    await orchestrator.execute(workflow, {}, 'manual');

    await vi.waitFor(() => {
      expect(execRepo.updateStatus).toHaveBeenCalledWith('exec-001', 'success');
    }, { timeout: 2000 });

    expect(stepExecutor.execute).toHaveBeenCalledTimes(2);
  });

  it('should stop pipeline when token limit exceeded', async () => {
    vi.mocked(stepExecutor.execute).mockResolvedValue({
      success: true, outputText: 'output', tokensUsed: 600
    });

    const workflow = createTestWorkflow({ limits: { maxTokens: 1000 } });
    await orchestrator.execute(workflow, {}, 'manual');

    await vi.waitFor(() => {
      expect(execRepo.updateStatus).toHaveBeenCalledWith('exec-001', 'failed', 'Token limit exceeded');
    }, { timeout: 2000 });
  });

  it('should mark execution as success when all steps pass', async () => {
    const workflow = createTestWorkflow({
      steps: [{ name: 'Single Step', prompt: 'Do it' }]
    });
    await orchestrator.execute(workflow, {}, 'scheduled');

    await vi.waitFor(() => {
      expect(execRepo.updateStatus).toHaveBeenCalledWith('exec-001', 'success');
    }, { timeout: 2000 });
  });

  it('should handle unexpected errors gracefully', async () => {
    vi.mocked(stepExecutor.execute).mockRejectedValueOnce(new Error('SDK crash'));

    const workflow = createTestWorkflow({
      steps: [{ name: 'Crash Step', prompt: 'Crash' }]
    });
    await orchestrator.execute(workflow, {}, 'manual');

    await vi.waitFor(() => {
      expect(execRepo.updateStatus).toHaveBeenCalledWith('exec-001', 'failed', 'SDK crash');
    }, { timeout: 2000 });
  });
});
