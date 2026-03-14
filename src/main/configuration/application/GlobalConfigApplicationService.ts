/**
 * 全局配置应用服务
 */

import type { GlobalConfig, McpServerConfig } from '../domain/model';
import type { DiskGlobalConfigRepository } from '../infrastructure/DiskGlobalConfigRepository';
import type { GlobalConfigCacheImpl } from '../infrastructure/GlobalConfigCache';

export class GlobalConfigApplicationService {
  constructor(
    private readonly diskConfigRepo: DiskGlobalConfigRepository,
    private readonly configCache: GlobalConfigCacheImpl
  ) {}

  getConfig(): GlobalConfig {
    return this.diskConfigRepo.getConfig();
  }

  updateConfig(data: {
    systemPrompt?: string;
    defaultModel?: string;
    mcpServers?: Record<string, McpServerConfig>;
  }): void {
    this.diskConfigRepo.updateConfig(data);
    this.configCache.invalidate();
  }
}
