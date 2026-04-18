/**
 * 生成结果提取器
 *
 * 从 skill-creator 会话的 assistant 文本中抓取最后一个 ```skill-result {...}``` JSON 代码块，
 * 返回 {name, suggestedTests}。解析失败或不存在时给出 fallback 默认值。
 */

const DEFAULT_SUGGESTED_TESTS = ['请演示这个 skill 的典型用法'];

const CODE_BLOCK_RE = /```skill-result\s*\n([\s\S]*?)\n```/g;

export interface GenerationResult {
  name?: string;
  suggestedTests: string[];
}

export function extractGenerationResult(text: string): GenerationResult {
  if (!text) {
    return { suggestedTests: [...DEFAULT_SUGGESTED_TESTS] };
  }

  const matches = [...text.matchAll(CODE_BLOCK_RE)];
  if (matches.length === 0) {
    return { suggestedTests: [...DEFAULT_SUGGESTED_TESTS] };
  }

  const lastJson = matches[matches.length - 1][1];
  let parsed: unknown;
  try {
    parsed = JSON.parse(lastJson);
  } catch {
    return { suggestedTests: [...DEFAULT_SUGGESTED_TESTS] };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { suggestedTests: [...DEFAULT_SUGGESTED_TESTS] };
  }

  const obj = parsed as Record<string, unknown>;
  const name = typeof obj.name === 'string' && obj.name.trim() !== '' ? obj.name.trim() : undefined;

  let suggestedTests: string[];
  if (Array.isArray(obj.suggestedTests)) {
    suggestedTests = obj.suggestedTests
      .map(item => (typeof item === 'string' ? item.trim() : ''))
      .filter(s => s.length > 0);
    if (suggestedTests.length === 0) {
      suggestedTests = [...DEFAULT_SUGGESTED_TESTS];
    }
  } else {
    suggestedTests = [...DEFAULT_SUGGESTED_TESTS];
  }

  return { name, suggestedTests };
}
