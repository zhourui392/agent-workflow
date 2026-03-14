/**
 * 领域服务 mock 工厂
 *
 * 提供 StepExecutor、ProgressNotifier、OutputProcessor、ConfigMergeService 的 mock 创建函数。
 */

import { vi } from 'vitest';
import type { StepExecutor, ProgressNotifier, OutputProcessor } from '../../src/main/execution/domain/service/PipelineOrchestrator';
import { ConfigMergeService } from '../../src/main/configuration/domain/service/ConfigMergeService';

/**
 * 创建 StepExecutor 的 vi.fn() mock
 *
 * 默认行为：
 * - execute → { success: true, outputText: 'step output', tokensUsed: 100 }
 * - executeWithTimeout → { success: true, outputText: 'step output', tokensUsed: 100 }
 * - validateOutput → { passed: true, output: 'ok', tokensUsed: 10 }
 */
export function createMockStepExecutor(): StepExecutor {
  return {
    execute: vi.fn(async () => ({ success: true, outputText: 'step output', tokensUsed: 100 })),
    executeWithTimeout: vi.fn(async () => ({ success: true, outputText: 'step output', tokensUsed: 100 })),
    validateOutput: vi.fn(async () => ({ passed: true, output: 'ok', tokensUsed: 10 }))
  };
}

/**
 * 创建 ProgressNotifier 的 vi.fn() mock
 *
 * 所有方法均为无操作 mock。
 */
export function createMockProgressNotifier(): ProgressNotifier {
  return {
    broadcastStepStart: vi.fn(),
    broadcastStepEvent: vi.fn(),
    broadcastStepResult: vi.fn(),
    broadcast: vi.fn()
  };
}

/**
 * 创建 OutputProcessor 的 vi.fn() mock
 *
 * 默认行为：
 * - process → Promise<void>
 */
export function createMockOutputProcessor(): OutputProcessor {
  return {
    process: vi.fn(async () => {})
  };
}

/**
 * 创建 ConfigMergeService 的 vi.fn() mock
 *
 * 默认行为：
 * - loadGlobalConfig → { systemPrompt: 'global prompt' }
 * - mergeWorkflowConfig → { systemPrompt: 'merged prompt', model: 'claude-3' }
 * - buildStepMergedConfig → { systemPrompt: 'merged prompt', model: 'claude-3', hasSkills: false }
 * - cleanupStepSkills → void
 * - validateConfigReferences → { valid: true, missingMcpIds: [], missingSkillIds: [] }
 * - buildAllowedTools → []
 * - handleDanglingReferences → void
 */
export function createMockConfigMergeService(): ConfigMergeService {
  const mock = {
    loadGlobalConfig: vi.fn(() => ({ systemPrompt: 'global prompt' })),
    mergeWorkflowConfig: vi.fn(() => ({ systemPrompt: 'merged prompt', model: 'claude-3' })),
    buildStepMergedConfig: vi.fn(() => ({ systemPrompt: 'merged prompt', model: 'claude-3', hasSkills: false })),
    cleanupStepSkills: vi.fn(),
    validateConfigReferences: vi.fn(() => ({ valid: true, missingMcpIds: [], missingSkillIds: [] })),
    buildAllowedTools: vi.fn(() => []),
    handleDanglingReferences: vi.fn()
  };
  return mock as unknown as ConfigMergeService;
}
