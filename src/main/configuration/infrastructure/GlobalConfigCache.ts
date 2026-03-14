/**
 * 全局配置缓存
 *
 * 实现 GlobalConfigProvider 接口，添加 TTL 缓存层
 */

import log from 'electron-log';
import type { GlobalConfig } from '../domain/model';
import type { GlobalConfigProvider } from '../domain/service/ConfigMergeService';
import type { CliConfigLoader } from './CliConfigLoader';
import type { DiskGlobalConfigRepository } from './DiskGlobalConfigRepository';

const CACHE_TTL_MS = 30_000;

export class GlobalConfigCacheImpl implements GlobalConfigProvider {
  private cachedConfig: GlobalConfig | null = null;
  private cacheTimestamp = 0;

  constructor(
    private readonly cliConfigLoader: CliConfigLoader,
    private readonly diskConfigRepo: DiskGlobalConfigRepository
  ) {}

  loadCliSkills(): Record<string, string> {
    return this.cliConfigLoader.loadClaudeCliSkills();
  }

  loadDiskConfig(): GlobalConfig {
    return this.diskConfigRepo.getConfig();
  }

  /**
   * 获取缓存的完整全局配置（TTL 30秒）
   * 供 ConfigMergeService.loadGlobalConfig() 使用时由外部管理
   */
  getCachedGlobalConfig(loadFn: () => GlobalConfig): GlobalConfig {
    const now = Date.now();
    if (this.cachedConfig && (now - this.cacheTimestamp) < CACHE_TTL_MS) {
      return this.cachedConfig;
    }

    log.debug('Refreshing global config cache');
    this.cachedConfig = loadFn();
    this.cacheTimestamp = now;
    return this.cachedConfig;
  }

  invalidate(): void {
    this.cachedConfig = null;
    this.cacheTimestamp = 0;
    log.debug('Global config cache invalidated');
  }
}
