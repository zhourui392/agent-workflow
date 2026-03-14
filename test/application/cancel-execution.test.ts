/**
 * CancelExecutionUseCase 单元测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CancelExecutionUseCase } from '../../src/main/execution/application/CancelExecutionUseCase';
import { CancellationRegistry } from '../../src/main/execution/domain/service/CancellationRegistry';
import { createTestExecution, createMockExecutionRepository } from '../fixtures';

describe('CancelExecutionUseCase', () => {
  let execRepo: ReturnType<typeof createMockExecutionRepository>;
  let registry: CancellationRegistry;
  let useCase: CancelExecutionUseCase;

  beforeEach(() => {
    execRepo = createMockExecutionRepository();
    registry = new CancellationRegistry();
    useCase = new CancelExecutionUseCase(execRepo, registry);
  });

  it('running execution can be cancelled', () => {
    const exec = createTestExecution({ status: 'running' });
    vi.mocked(execRepo.findById).mockReturnValue(exec);

    const result = useCase.cancel('exec-001');

    expect(result).toBe(true);
    expect(registry.isCancellationRequested('exec-001')).toBe(true);
  });

  it('pending execution can be cancelled', () => {
    const exec = createTestExecution({ status: 'pending' });
    vi.mocked(execRepo.findById).mockReturnValue(exec);

    const result = useCase.cancel('exec-001');

    expect(result).toBe(true);
    expect(registry.isCancellationRequested('exec-001')).toBe(true);
  });

  it('terminal execution cannot be cancelled', () => {
    const exec = createTestExecution({ status: 'success' });
    vi.mocked(execRepo.findById).mockReturnValue(exec);

    const result = useCase.cancel('exec-001');

    expect(result).toBe(false);
    expect(registry.isCancellationRequested('exec-001')).toBe(false);
  });

  it('non-existent execution returns false', () => {
    vi.mocked(execRepo.findById).mockReturnValue(null);

    const result = useCase.cancel('non-existent');

    expect(result).toBe(false);
  });
});
