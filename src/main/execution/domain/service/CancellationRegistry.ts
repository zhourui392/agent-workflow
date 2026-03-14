/**
 * 取消注册表（领域服务）
 *
 * 纯内存 Set 跟踪哪些执行被请求取消。
 * PipelineOrchestrator 在每个步骤执行前检查此标志。
 */
export class CancellationRegistry {
  private readonly requested = new Set<string>();

  requestCancellation(executionId: string): void {
    this.requested.add(executionId);
  }

  isCancellationRequested(executionId: string): boolean {
    return this.requested.has(executionId);
  }

  clear(executionId: string): void {
    this.requested.delete(executionId);
  }
}
