/**
 * 安全 JSON 解析工具
 *
 * @author zhourui(V33215020)
 * @since 2026/03/14
 */

import log from 'electron-log';

/**
 * 安全解析 JSON 字符串，解析失败时返回 fallback 值
 *
 * @param json JSON 字符串
 * @param fallback 解析失败时的默认值
 * @param context 日志上下文（用于问题排查）
 * @returns 解析结果或 fallback
 */
export function safeJsonParse<T>(json: string | null | undefined, fallback: T, context?: string): T {
  if (json === null || json === undefined) {
    return fallback;
  }

  try {
    return JSON.parse(json) as T;
  } catch (error) {
    log.warn(`JSON 解析失败${context ? ` (${context})` : ''}: ${error instanceof Error ? error.message : String(error)}`);
    return fallback;
  }
}
