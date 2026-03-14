/**
 * 取消执行用例
 */

import type { ExecutionRepository } from '../domain/repository/ExecutionRepository';
import type { CancellationRegistry } from '../domain/service/CancellationRegistry';

export class CancelExecutionUseCase {
  constructor(
    private readonly executionRepository: ExecutionRepository,
    private readonly cancellationRegistry: CancellationRegistry
  ) {}

  cancel(executionId: string): boolean {
    const execution = this.executionRepository.findById(executionId);
    if (!execution || execution.isTerminal) return false;

    this.cancellationRegistry.requestCancellation(executionId);
    return true;
  }
}
