/**
 * safeJsonParse 测试
 *
 * @author zhourui(V33215020)
 * @since 2026/03/14
 */

import { describe, it, expect } from 'vitest';
import { safeJsonParse } from '../src/main/utils/safeJson';

describe('safeJsonParse', () => {
  it('should parse valid JSON', () => {
    expect(safeJsonParse('{"key": "value"}', {})).toEqual({ key: 'value' });
  });

  it('should parse valid JSON array', () => {
    expect(safeJsonParse('[1, 2, 3]', [])).toEqual([1, 2, 3]);
  });

  it('should return fallback for null input', () => {
    expect(safeJsonParse(null, 'default')).toBe('default');
  });

  it('should return fallback for undefined input', () => {
    expect(safeJsonParse(undefined, [])).toEqual([]);
  });

  it('should return fallback for invalid JSON', () => {
    expect(safeJsonParse('{invalid}', {})).toEqual({});
  });

  it('should return fallback for empty string', () => {
    expect(safeJsonParse('', 'fallback')).toBe('fallback');
  });

  it('should handle nested JSON', () => {
    const json = '{"steps": [{"name": "s1", "prompt": "p1"}]}';
    const result = safeJsonParse<{ steps: { name: string }[] }>(json, { steps: [] });
    expect(result.steps[0].name).toBe('s1');
  });

  it('should accept context parameter for logging', () => {
    const result = safeJsonParse('bad', 'default', 'test-context');
    expect(result).toBe('default');
  });
});
