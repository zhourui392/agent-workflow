/**
 * 全局配置缓存
 *
 * 避免每次流水线执行时重复读取磁盘和 CLI 配置
 *
 * @author zhourui(V33215020)
 * @since 2026/03/14
 */

import log from 'electron-log';
import type { GlobalConfig } from '../../store/models';
import { loadGlobalConfig } from './configMerger';

const CACHE_TTL_MS = 30_000;

let cachedConfig: GlobalConfig | null = null;
let cacheTimestamp = 0;

/**
 * 获取缓存的全局配置（TTL 30秒）
 *
 * @returns 全局配置对象
 */
export function getCachedGlobalConfig(): GlobalConfig {
  const now = Date.now();
  if (cachedConfig && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedConfig;
  }

  log.debug('Refreshing global config cache');
  cachedConfig = loadGlobalConfig();
  cacheTimestamp = now;
  return cachedConfig;
}

/**
 * 使缓存失效（配置更新时调用）
 */
export function invalidateGlobalConfigCache(): void {
  cachedConfig = null;
  cacheTimestamp = 0;
  log.debug('Global config cache invalidated');
}
