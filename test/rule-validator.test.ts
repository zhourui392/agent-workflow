/**
 * RuleValidator 领域服务测试
 */

import { describe, it, expect } from 'vitest';
import { RuleValidator } from '../src/main/execution/domain/service/RuleValidator';

describe('RuleValidator', () => {
  const validator = new RuleValidator();

  describe('contains', () => {
    it('output contains value → passed', () => {
      const result = validator.validate('hello world', [
        { type: 'contains', value: 'hello' }
      ]);
      expect(result.passed).toBe(true);
    });

    it('output does not contain value → failed', () => {
      const result = validator.validate('hello world', [
        { type: 'contains', value: 'goodbye' }
      ]);
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('goodbye');
    });
  });

  describe('regex', () => {
    it('output matches regex → passed', () => {
      const result = validator.validate('error code: 404', [
        { type: 'regex', pattern: '\\d{3}' }
      ]);
      expect(result.passed).toBe(true);
    });

    it('output does not match regex → failed', () => {
      const result = validator.validate('no numbers here', [
        { type: 'regex', pattern: '\\d{3}' }
      ]);
      expect(result.passed).toBe(false);
    });

    it('invalid regex → failed with reason', () => {
      const result = validator.validate('anything', [
        { type: 'regex', pattern: '[invalid' }
      ]);
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('无效正则');
    });
  });

  describe('multiple rules', () => {
    it('all rules pass → passed', () => {
      const result = validator.validate('result: 200 OK', [
        { type: 'contains', value: 'result' },
        { type: 'regex', pattern: '\\d+' }
      ]);
      expect(result.passed).toBe(true);
    });

    it('first rule fails → immediately returns failed', () => {
      const result = validator.validate('no match', [
        { type: 'contains', value: 'missing' },
        { type: 'contains', value: 'no' }
      ]);
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('missing');
    });
  });

  describe('empty rules', () => {
    it('no rules → passed', () => {
      const result = validator.validate('anything', []);
      expect(result.passed).toBe(true);
    });
  });
});
