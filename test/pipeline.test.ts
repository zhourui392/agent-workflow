/**
 * Pipeline 编排器测试
 *
 * @author zhourui(V33215020)
 * @since 2026/03/14
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before imports
vi.mock('../src/main/store/repositories', () => ({
  executionRepository: {
    create: vi.fn(() => ({ id: 'exec-001', workflowId: 'wf-001' })),
    updateStatus: vi.fn(),
    updateCurrentStep: vi.fn(),
    createStepExecution: vi.fn(() => ({ id: 'step-exec-001' })),
    updateStepExecution: vi.fn(),
    addTokens: vi.fn()
  }
}));

vi.mock('../src/main/core/config/globalConfigCache', () => ({
  getCachedGlobalConfig: vi.fn(() => ({
    systemPrompt: 'global prompt'
  }))
}));

vi.mock('../src/main/core/config/configMerger', () => ({
  mergeConfig: vi.fn((_global, _workflow) => ({
    systemPrompt: 'merged prompt',
    model: 'claude-3'
  })),
  buildStepMergedConfig: vi.fn((_merged, _wf, _step, _execId, _idx) => ({
    systemPrompt: 'merged prompt',
    model: 'claude-3',
    hasSkills: false
  })),
  cleanupStepSkills: vi.fn()
}));

vi.mock('../src/main/core/executor', () => ({
  executeStep: vi.fn(async () => ({
    success: true,
    outputText: 'step output',
    tokensUsed: 100
  })),
  executeStepWithTimeout: vi.fn(async () => ({
    success: true,
    outputText: 'step output',
    tokensUsed: 100
  })),
  validateStepOutput: vi.fn(async () => ({
    passed: true,
    output: 'ok',
    tokensUsed: 10
  }))
}));

vi.mock('../src/main/core/outputHandler', () => ({
  handleOutput: vi.fn(async () => {})
}));

import { executePipeline } from '../src/main/core/pipeline';
import { executionRepository } from '../src/main/store/repositories';
import { executeStep } from '../src/main/core/executor';
import type { Workflow } from '../src/main/store/models';

function createTestWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    id: 'wf-001',
    name: 'Test Workflow',
    enabled: true,
    steps: [
      { name: 'Step 1', prompt: 'Do task 1' },
      { name: 'Step 2', prompt: 'Do task 2 with {{steps.Step 1.output}}' }
    ],
    onFailure: 'stop',
    createdAt: '2026-03-14',
    updatedAt: '2026-03-14',
    ...overrides
  };
}

describe('executePipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create execution and return execution ID', async () => {
    const workflow = createTestWorkflow();
    const executionId = await executePipeline(workflow, {}, 'manual');
    expect(executionId).toBe('exec-001');
    expect(executionRepository.create).toHaveBeenCalledWith('wf-001', 'manual');
  });

  it('should execute all steps in order', async () => {
    const workflow = createTestWorkflow();
    await executePipeline(workflow, {}, 'manual');

    // Wait for async pipeline to finish
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(executionRepository.updateStatus).toHaveBeenCalledWith('exec-001', 'running');
    expect(executionRepository.createStepExecution).toHaveBeenCalledTimes(2);
    expect(executeStep).toHaveBeenCalledTimes(2);
  });

  it('should stop pipeline when step fails with onFailure=stop', async () => {
    vi.mocked(executeStep).mockResolvedValueOnce({
      success: false,
      outputText: '',
      tokensUsed: 50,
      errorMessage: 'step failed'
    });

    const workflow = createTestWorkflow({ onFailure: 'stop' });
    await executePipeline(workflow, {}, 'manual');
    await new Promise(resolve => setTimeout(resolve, 100));

    // Only first step executed
    expect(executeStep).toHaveBeenCalledTimes(1);
    expect(executionRepository.updateStatus).toHaveBeenCalledWith(
      'exec-001', 'failed', 'step failed'
    );
  });

  it('should skip failed step with onFailure=skip', async () => {
    vi.mocked(executeStep)
      .mockResolvedValueOnce({
        success: false,
        outputText: '',
        tokensUsed: 50,
        errorMessage: 'step failed'
      })
      .mockResolvedValueOnce({
        success: true,
        outputText: 'step 2 output',
        tokensUsed: 100
      });

    const workflow = createTestWorkflow({ onFailure: 'skip' });
    await executePipeline(workflow, {}, 'manual');
    await new Promise(resolve => setTimeout(resolve, 100));

    // Both steps executed
    expect(executeStep).toHaveBeenCalledTimes(2);
    expect(executionRepository.updateStatus).toHaveBeenCalledWith('exec-001', 'success');
  });

  it('should stop pipeline when token limit exceeded', async () => {
    vi.mocked(executeStep).mockResolvedValue({
      success: true,
      outputText: 'output',
      tokensUsed: 600
    });

    const workflow = createTestWorkflow({
      limits: { maxTokens: 1000 }
    });
    await executePipeline(workflow, {}, 'manual');
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(executionRepository.updateStatus).toHaveBeenCalledWith(
      'exec-001', 'failed', 'Token limit exceeded'
    );
  });

  it('should mark execution as success when all steps pass', async () => {
    const workflow = createTestWorkflow({
      steps: [{ name: 'Single Step', prompt: 'Do it' }]
    });
    await executePipeline(workflow, {}, 'scheduled');
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(executionRepository.updateStatus).toHaveBeenCalledWith('exec-001', 'success');
  });

  it('should handle unexpected errors gracefully', async () => {
    vi.mocked(executeStep).mockRejectedValueOnce(new Error('SDK crash'));

    const workflow = createTestWorkflow({
      steps: [{ name: 'Crash Step', prompt: 'Crash' }]
    });
    await executePipeline(workflow, {}, 'manual');
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(executionRepository.updateStatus).toHaveBeenCalledWith(
      'exec-001', 'failed', 'SDK crash'
    );
  });
});
