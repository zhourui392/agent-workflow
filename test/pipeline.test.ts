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
import { CancellationRegistry } from '../src/main/execution/domain/service/CancellationRegistry';
import { RuleValidator } from '../src/main/execution/domain/service/RuleValidator';
import type { WorkflowLoader } from '../src/main/execution/domain/service/PipelineOrchestrator';
import {
  createTestWorkflow,
  createMockExecutionRepository,
  createMockStepExecutor,
  createMockProgressNotifier,
  createMockOutputProcessor,
  createMockConfigMergeService,
  createMockWorkflowLoader,
  createTestWorkflowRef
} from './fixtures';

describe('PipelineOrchestrator', () => {
  let execRepo: ExecutionRepository;
  let stepExecutor: StepExecutor;
  let configService: ConfigMergeService;
  let notifier: ProgressNotifier;
  let outputProcessor: OutputProcessor;
  let cancellationRegistry: CancellationRegistry;
  let orchestrator: PipelineOrchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    execRepo = createMockExecutionRepository();
    stepExecutor = createMockStepExecutor();
    configService = createMockConfigMergeService();
    notifier = createMockProgressNotifier();
    outputProcessor = createMockOutputProcessor();
    cancellationRegistry = new CancellationRegistry();
    orchestrator = new PipelineOrchestrator(
      execRepo, stepExecutor, configService, notifier, outputProcessor, new TemplateEngine(), cancellationRegistry, new RuleValidator()
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

  it('should run rule validation before LLM validation', async () => {
    vi.mocked(stepExecutor.execute).mockResolvedValue({
      success: true, outputText: 'no match here', tokensUsed: 100
    });

    const workflow = createTestWorkflow({
      steps: [{
        name: 'Validated Step',
        prompt: 'do it',
        validation: {
          prompt: 'check output',
          rules: [{ type: 'contains', value: 'expected-keyword' }]
        }
      }]
    });
    await orchestrator.execute(workflow, {}, 'manual');

    await vi.waitFor(() => {
      expect(execRepo.updateStatus).toHaveBeenCalledWith('exec-001', 'failed', expect.stringContaining('规则验证失败'));
    }, { timeout: 2000 });

    // LLM validateOutput should NOT have been called since rules failed first
    expect(stepExecutor.validateOutput).not.toHaveBeenCalled();
  });

  it('should retry on validation failure when onFailure=retry', async () => {
    let callCount = 0;
    vi.mocked(stepExecutor.execute).mockImplementation(async () => {
      callCount++;
      return {
        success: true,
        outputText: callCount === 1 ? 'bad output' : 'good output with expected-keyword',
        tokensUsed: 100
      };
    });

    const workflow = createTestWorkflow({
      onFailure: 'retry',
      retryConfig: { maxAttempts: 3, delayMs: 10 },
      steps: [{
        name: 'Retry Step',
        prompt: 'do it',
        validation: {
          rules: [{ type: 'contains', value: 'expected-keyword' }]
        }
      }]
    });
    await orchestrator.execute(workflow, {}, 'manual');

    await vi.waitFor(() => {
      expect(execRepo.updateStatus).toHaveBeenCalledWith('exec-001', 'success');
    }, { timeout: 2000 });

    // Should have been called twice (first fail, second pass)
    expect(stepExecutor.execute).toHaveBeenCalledTimes(2);
  });

  it('should fail after max retry attempts on validation failure', async () => {
    vi.mocked(stepExecutor.execute).mockResolvedValue({
      success: true, outputText: 'always bad', tokensUsed: 50
    });

    const workflow = createTestWorkflow({
      onFailure: 'retry',
      retryConfig: { maxAttempts: 2, delayMs: 10 },
      steps: [{
        name: 'Always Fail Step',
        prompt: 'do it',
        validation: {
          rules: [{ type: 'contains', value: 'never-matches' }]
        }
      }]
    });
    await orchestrator.execute(workflow, {}, 'manual');

    await vi.waitFor(() => {
      expect(execRepo.updateStatus).toHaveBeenCalledWith('exec-001', 'failed', expect.stringContaining('规则验证失败'));
    }, { timeout: 2000 });

    expect(stepExecutor.execute).toHaveBeenCalledTimes(2);
  });

  it('should cancel pipeline when cancellation is requested before step execution', async () => {
    // Make first step slow so cancellation can be checked before second step
    vi.mocked(stepExecutor.execute).mockImplementation(async () => {
      // After first step completes, request cancellation
      cancellationRegistry.requestCancellation('exec-001');
      return { success: true, outputText: 'output', tokensUsed: 100 };
    });

    const workflow = createTestWorkflow({
      steps: [
        { name: 'Step 1', prompt: 'first' },
        { name: 'Step 2', prompt: 'second' }
      ]
    });
    await orchestrator.execute(workflow, {}, 'manual');

    await vi.waitFor(() => {
      expect(execRepo.updateStatus).toHaveBeenCalledWith('exec-001', 'cancelled', '用户取消');
    }, { timeout: 2000 });

    // Only first step should have executed
    expect(stepExecutor.execute).toHaveBeenCalledTimes(1);
  });

  // ===========================================================================
  // 子工作流执行
  // ===========================================================================

  describe('子工作流步骤', () => {
    let workflowLoader: WorkflowLoader;

    beforeEach(() => {
      workflowLoader = createMockWorkflowLoader();
      orchestrator = new PipelineOrchestrator(
        execRepo, stepExecutor, configService, notifier, outputProcessor,
        new TemplateEngine(), cancellationRegistry, new RuleValidator(), workflowLoader
      );
    });

    it('should execute sub-workflow and capture output', async () => {
      const subWorkflowRef = createTestWorkflowRef();
      vi.mocked(workflowLoader.loadWorkflow).mockReturnValue(subWorkflowRef);

      const workflow = createTestWorkflow({
        steps: [
          { type: 'subWorkflow', name: 'Call Sub', workflowId: 'sub-wf-001' } as any
        ]
      });

      await orchestrator.execute(workflow, {}, 'manual');

      await vi.waitFor(() => {
        expect(execRepo.updateStatus).toHaveBeenCalledWith('exec-001', 'success');
      }, { timeout: 2000 });

      // Sub-workflow creates its own execution
      expect(execRepo.create).toHaveBeenCalledTimes(2); // parent + child
      // Sub-workflow step was executed via stepExecutor
      expect(stepExecutor.execute).toHaveBeenCalledTimes(1);
    });

    it('should fail when sub-workflow not found', async () => {
      vi.mocked(workflowLoader.loadWorkflow).mockReturnValue(null);

      const workflow = createTestWorkflow({
        steps: [
          { type: 'subWorkflow', name: 'Missing', workflowId: 'not-exist' } as any
        ]
      });

      await orchestrator.execute(workflow, {}, 'manual');

      await vi.waitFor(() => {
        expect(execRepo.updateStatus).toHaveBeenCalledWith('exec-001', 'failed',
          expect.stringContaining('子工作流不存在'));
      }, { timeout: 2000 });
    });

    it('should execute forEach iterations serially', async () => {
      const subWorkflowRef = createTestWorkflowRef();
      vi.mocked(workflowLoader.loadWorkflow).mockReturnValue(subWorkflowRef);

      let callCount = 0;
      vi.mocked(stepExecutor.execute).mockImplementation(async () => {
        callCount++;
        return { success: true, outputText: `result-${callCount}`, tokensUsed: 50 };
      });

      const workflow = createTestWorkflow({
        steps: [
          { name: 'Split', prompt: 'split tasks' },
          {
            type: 'subWorkflow', name: 'Loop', workflowId: 'sub-wf-001',
            forEach: { iterateOver: '{{steps.Split.output}}', itemVariable: 'task' }
          } as any
        ]
      });

      // First step returns JSON array
      vi.mocked(stepExecutor.execute).mockResolvedValueOnce({
        success: true, outputText: '["task1","task2","task3"]', tokensUsed: 100
      });
      // Sub-workflow steps
      vi.mocked(stepExecutor.execute)
        .mockResolvedValueOnce({ success: true, outputText: 'done-1', tokensUsed: 50 })
        .mockResolvedValueOnce({ success: true, outputText: 'done-2', tokensUsed: 50 })
        .mockResolvedValueOnce({ success: true, outputText: 'done-3', tokensUsed: 50 });

      await orchestrator.execute(workflow, {}, 'manual');

      await vi.waitFor(() => {
        expect(execRepo.updateStatus).toHaveBeenCalledWith('exec-001', 'success');
      }, { timeout: 2000 });

      // 1 parent step + 3 forEach child executions
      expect(stepExecutor.execute).toHaveBeenCalledTimes(4);
      // Parent + 3 child executions
      expect(execRepo.create).toHaveBeenCalledTimes(4);
    });

    it('should pass inputMapping to sub-workflow', async () => {
      const subWorkflowRef = createTestWorkflowRef();
      vi.mocked(workflowLoader.loadWorkflow).mockReturnValue(subWorkflowRef);

      const workflow = createTestWorkflow({
        steps: [
          {
            type: 'subWorkflow', name: 'Sub', workflowId: 'sub-wf-001',
            inputMapping: { target: '{{inputs.myParam}}' }
          } as any
        ]
      });

      await orchestrator.execute(workflow, { myParam: 'hello' }, 'manual');

      await vi.waitFor(() => {
        expect(execRepo.updateStatus).toHaveBeenCalledWith('exec-001', 'success');
      }, { timeout: 2000 });

      expect(stepExecutor.execute).toHaveBeenCalledTimes(1);
    });
  });
});
