/**
 * GenerationResultExtractor 单元测试
 *
 * 从 skill-creator 生成会话的 assistant 文本尾部抓取 ```skill-result {...}``` JSON 块。
 */

import { describe, it, expect } from 'vitest';
import { extractGenerationResult } from '../../src/main/configuration/domain/service/GenerationResultExtractor';

describe('extractGenerationResult', () => {
  it('抓取合法的 skill-result 代码块', () => {
    const text = [
      'Some narration...',
      '',
      '```skill-result',
      '{"name": "my-skill", "suggestedTests": ["跑一次 hello", "测试 edge case"]}',
      '```',
      ''
    ].join('\n');
    const result = extractGenerationResult(text);
    expect(result.name).toBe('my-skill');
    expect(result.suggestedTests).toEqual(['跑一次 hello', '测试 edge case']);
  });

  it('name 非字符串时 fallback 为 undefined name', () => {
    const text = '```skill-result\n{"suggestedTests": ["ok"]}\n```';
    const result = extractGenerationResult(text);
    expect(result.name).toBeUndefined();
    expect(result.suggestedTests).toEqual(['ok']);
  });

  it('无 code block 时返回 fallback', () => {
    const text = 'I created a skill but forgot to output the json.';
    const result = extractGenerationResult(text);
    expect(result.name).toBeUndefined();
    expect(result.suggestedTests.length).toBeGreaterThan(0);
  });

  it('JSON 解析失败时返回 fallback', () => {
    const text = '```skill-result\nnot json at all\n```';
    const result = extractGenerationResult(text);
    expect(result.name).toBeUndefined();
    expect(result.suggestedTests.length).toBeGreaterThan(0);
  });

  it('suggestedTests 为非数组时 fallback', () => {
    const text = '```skill-result\n{"name":"x","suggestedTests":"not array"}\n```';
    const result = extractGenerationResult(text);
    expect(result.name).toBe('x');
    expect(Array.isArray(result.suggestedTests)).toBe(true);
    expect(result.suggestedTests.length).toBeGreaterThan(0);
  });

  it('存在多个 code block 时取最后一个', () => {
    const text = [
      '```skill-result',
      '{"name":"first","suggestedTests":["a"]}',
      '```',
      'later...',
      '```skill-result',
      '{"name":"final","suggestedTests":["b"]}',
      '```'
    ].join('\n');
    const result = extractGenerationResult(text);
    expect(result.name).toBe('final');
    expect(result.suggestedTests).toEqual(['b']);
  });

  it('空字符串返回 fallback', () => {
    const result = extractGenerationResult('');
    expect(result.name).toBeUndefined();
    expect(result.suggestedTests.length).toBeGreaterThan(0);
  });
});
