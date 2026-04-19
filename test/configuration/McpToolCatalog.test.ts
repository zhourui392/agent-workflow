/**
 * MCP 工具目录服务单测
 *
 * 覆盖：TTL 缓存、forceRefresh、per-server 失败降级、invalidate
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InMemoryMcpToolCatalog } from '../../src/main/configuration/infrastructure/InMemoryMcpToolCatalog';
import type { McpToolLister } from '../../src/main/configuration/domain/service/McpToolCatalogService';
import type { McpServerConfig } from '../../src/main/configuration/domain/model/McpServerConfig';
import type { McpTool } from '../../src/main/configuration/domain/model/McpTool';

function makeLister(responses: Record<string, McpTool[] | Error>): McpToolLister {
  return {
    listTools: vi.fn(async (server: string): Promise<McpTool[]> => {
      const r = responses[server];
      if (r instanceof Error) throw r;
      if (!r) throw new Error(`unknown server: ${server}`);
      return r;
    })
  };
}

function makeClock(startAt = 1000) {
  let t = startAt;
  return {
    now: () => t,
    advance: (ms: number) => { t += ms; }
  };
}

const serversFixture: Record<string, McpServerConfig> = {
  alpha: { command: '/bin/alpha' },
  beta: { command: '/bin/beta', args: ['--flag'] }
};

const alphaTools: McpTool[] = [
  { name: 'search', description: 'search files' },
  { name: 'read' }
];
const betaTools: McpTool[] = [{ name: 'ping' }];

describe('InMemoryMcpToolCatalog.listAll', () => {
  let clock: ReturnType<typeof makeClock>;
  beforeEach(() => { clock = makeClock(); });

  it('首次调用对每个 server 各调一次 lister，返回工具列表', async () => {
    const lister = makeLister({ alpha: alphaTools, beta: betaTools });
    const catalog = new InMemoryMcpToolCatalog({
      getMcpServers: () => serversFixture,
      lister,
      ttlMs: 60_000,
      now: clock.now
    });

    const result = await catalog.listAll();

    expect(Object.keys(result).sort()).toEqual(['alpha', 'beta']);
    expect(result.alpha.tools).toEqual(alphaTools);
    expect(result.beta.tools).toEqual(betaTools);
    expect(result.alpha.error).toBeUndefined();
    expect(result.alpha.fetchedAt).toBe(1000);
    expect(lister.listTools).toHaveBeenCalledTimes(2);
  });

  it('TTL 内二次调用命中缓存，不再调用 lister', async () => {
    const lister = makeLister({ alpha: alphaTools, beta: betaTools });
    const catalog = new InMemoryMcpToolCatalog({
      getMcpServers: () => serversFixture,
      lister,
      ttlMs: 60_000,
      now: clock.now
    });

    await catalog.listAll();
    clock.advance(30_000);
    await catalog.listAll();

    expect(lister.listTools).toHaveBeenCalledTimes(2);
  });

  it('TTL 过期后重新调用 lister', async () => {
    const lister = makeLister({ alpha: alphaTools, beta: betaTools });
    const catalog = new InMemoryMcpToolCatalog({
      getMcpServers: () => serversFixture,
      lister,
      ttlMs: 60_000,
      now: clock.now
    });

    await catalog.listAll();
    clock.advance(60_001);
    await catalog.listAll();

    expect(lister.listTools).toHaveBeenCalledTimes(4);
  });

  it('forceRefresh=true 直接绕过缓存', async () => {
    const lister = makeLister({ alpha: alphaTools, beta: betaTools });
    const catalog = new InMemoryMcpToolCatalog({
      getMcpServers: () => serversFixture,
      lister,
      ttlMs: 60_000,
      now: clock.now
    });

    await catalog.listAll();
    await catalog.listAll(true);

    expect(lister.listTools).toHaveBeenCalledTimes(4);
  });

  it('单个 server 失败不影响其他 server，失败者 tools=[] 且 error 非空', async () => {
    const lister = makeLister({
      alpha: new Error('boom: alpha died'),
      beta: betaTools
    });
    const catalog = new InMemoryMcpToolCatalog({
      getMcpServers: () => serversFixture,
      lister,
      ttlMs: 60_000,
      now: clock.now
    });

    const result = await catalog.listAll();

    expect(result.alpha.tools).toEqual([]);
    expect(result.alpha.error).toContain('boom: alpha died');
    expect(result.beta.tools).toEqual(betaTools);
    expect(result.beta.error).toBeUndefined();
  });

  it('无已配置 server 时返回空对象', async () => {
    const lister = makeLister({});
    const catalog = new InMemoryMcpToolCatalog({
      getMcpServers: () => ({}),
      lister,
      ttlMs: 60_000,
      now: clock.now
    });

    const result = await catalog.listAll();
    expect(result).toEqual({});
    expect(lister.listTools).not.toHaveBeenCalled();
  });
});

describe('InMemoryMcpToolCatalog.listByServer', () => {
  let clock: ReturnType<typeof makeClock>;
  beforeEach(() => { clock = makeClock(); });

  it('返回指定 server 的工具列表', async () => {
    const lister = makeLister({ alpha: alphaTools, beta: betaTools });
    const catalog = new InMemoryMcpToolCatalog({
      getMcpServers: () => serversFixture,
      lister,
      ttlMs: 60_000,
      now: clock.now
    });

    const result = await catalog.listByServer('alpha');
    expect(result.tools).toEqual(alphaTools);
    expect(result.error).toBeUndefined();
    expect(lister.listTools).toHaveBeenCalledTimes(1);
  });

  it('未知 server 返回 tools=[] 且 error 非空', async () => {
    const lister = makeLister({});
    const catalog = new InMemoryMcpToolCatalog({
      getMcpServers: () => serversFixture,
      lister,
      ttlMs: 60_000,
      now: clock.now
    });

    const result = await catalog.listByServer('gamma');
    expect(result.tools).toEqual([]);
    expect(result.error).toMatch(/gamma/);
    expect(lister.listTools).not.toHaveBeenCalled();
  });

  it('TTL 内命中缓存', async () => {
    const lister = makeLister({ alpha: alphaTools });
    const catalog = new InMemoryMcpToolCatalog({
      getMcpServers: () => ({ alpha: serversFixture.alpha }),
      lister,
      ttlMs: 60_000,
      now: clock.now
    });

    await catalog.listByServer('alpha');
    await catalog.listByServer('alpha');
    expect(lister.listTools).toHaveBeenCalledTimes(1);
  });
});

describe('InMemoryMcpToolCatalog.invalidate', () => {
  it('清空缓存后下次调用重新触发 lister', async () => {
    const clock = makeClock();
    const lister = makeLister({ alpha: alphaTools });
    const catalog = new InMemoryMcpToolCatalog({
      getMcpServers: () => ({ alpha: serversFixture.alpha }),
      lister,
      ttlMs: 60_000,
      now: clock.now
    });

    await catalog.listAll();
    catalog.invalidate();
    await catalog.listAll();

    expect(lister.listTools).toHaveBeenCalledTimes(2);
  });
});
