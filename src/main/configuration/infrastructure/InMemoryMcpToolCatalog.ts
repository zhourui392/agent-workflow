/**
 * MCP 工具目录内存实现（TTL 缓存 + 并发枚举 + 单 server 失败降级）
 */

import type { McpServerConfig } from '../domain/model/McpServerConfig';
import type { McpServerTools } from '../domain/model/McpTool';
import type {
  McpToolCatalog,
  McpToolLister
} from '../domain/service/McpToolCatalogService';

export interface InMemoryMcpToolCatalogOptions {
  /** 读取当前生效的 mcpServers map（通常取 CLI + 磁盘合并后的结果） */
  getMcpServers: () => Record<string, McpServerConfig>;
  lister: McpToolLister;
  /** 缓存过期时间（毫秒）；默认 5 分钟 */
  ttlMs?: number;
  /** 单 server 枚举超时（毫秒）；默认 10s */
  perServerTimeoutMs?: number;
  /** 注入时钟便于测试 */
  now?: () => number;
}

export class InMemoryMcpToolCatalog implements McpToolCatalog {
  private readonly getMcpServers: () => Record<string, McpServerConfig>;
  private readonly lister: McpToolLister;
  private readonly ttlMs: number;
  private readonly perServerTimeoutMs: number;
  private readonly now: () => number;
  private cache = new Map<string, McpServerTools>();
  private inflight = new Map<string, Promise<McpServerTools>>();

  constructor(opts: InMemoryMcpToolCatalogOptions) {
    this.getMcpServers = opts.getMcpServers;
    this.lister = opts.lister;
    this.ttlMs = opts.ttlMs ?? 5 * 60 * 1000;
    this.perServerTimeoutMs = opts.perServerTimeoutMs ?? 10_000;
    this.now = opts.now ?? (() => Date.now());
  }

  async listAll(forceRefresh = false): Promise<Record<string, McpServerTools>> {
    const servers = this.getMcpServers();
    const names = Object.keys(servers);
    const results = await Promise.all(
      names.map(name => this.fetchOne(name, servers[name]!, forceRefresh))
    );
    const map: Record<string, McpServerTools> = {};
    for (const r of results) map[r.server] = r;
    return map;
  }

  async listByServer(server: string, forceRefresh = false): Promise<McpServerTools> {
    const servers = this.getMcpServers();
    const config = servers[server];
    if (!config) {
      return {
        server,
        tools: [],
        error: `MCP server not configured: ${server}`,
        fetchedAt: this.now()
      };
    }
    return this.fetchOne(server, config, forceRefresh);
  }

  invalidate(): void {
    this.cache.clear();
  }

  private async fetchOne(
    server: string,
    config: McpServerConfig,
    forceRefresh: boolean
  ): Promise<McpServerTools> {
    if (!forceRefresh) {
      const cached = this.cache.get(server);
      if (cached && this.now() - cached.fetchedAt < this.ttlMs) {
        return cached;
      }
    }

    const existing = this.inflight.get(server);
    if (existing) return existing;

    const promise = this.fetchWithFallback(server, config);
    this.inflight.set(server, promise);
    try {
      const result = await promise;
      this.cache.set(server, result);
      return result;
    } finally {
      this.inflight.delete(server);
    }
  }

  private async fetchWithFallback(
    server: string,
    config: McpServerConfig
  ): Promise<McpServerTools> {
    const fetchedAt = this.now();
    try {
      const tools = await this.lister.listTools(server, config, this.perServerTimeoutMs);
      return { server, tools, fetchedAt };
    } catch (err) {
      return {
        server,
        tools: [],
        error: err instanceof Error ? err.message : String(err),
        fetchedAt
      };
    }
  }
}
