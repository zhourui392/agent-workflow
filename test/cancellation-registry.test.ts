/**
 * CancellationRegistry 领域服务测试
 */

import { describe, it, expect } from 'vitest';
import { CancellationRegistry } from '../src/main/execution/domain/service/CancellationRegistry';

describe('CancellationRegistry', () => {
  it('requestCancellation marks execution as cancellation-requested', () => {
    const registry = new CancellationRegistry();
    registry.requestCancellation('exec-001');
    expect(registry.isCancellationRequested('exec-001')).toBe(true);
  });

  it('isCancellationRequested returns false for unknown execution', () => {
    const registry = new CancellationRegistry();
    expect(registry.isCancellationRequested('exec-unknown')).toBe(false);
  });

  it('clear removes the cancellation flag', () => {
    const registry = new CancellationRegistry();
    registry.requestCancellation('exec-001');
    registry.clear('exec-001');
    expect(registry.isCancellationRequested('exec-001')).toBe(false);
  });

  it('multiple executions are tracked independently', () => {
    const registry = new CancellationRegistry();
    registry.requestCancellation('exec-001');
    registry.requestCancellation('exec-002');
    expect(registry.isCancellationRequested('exec-001')).toBe(true);
    expect(registry.isCancellationRequested('exec-002')).toBe(true);
    registry.clear('exec-001');
    expect(registry.isCancellationRequested('exec-001')).toBe(false);
    expect(registry.isCancellationRequested('exec-002')).toBe(true);
  });
});
