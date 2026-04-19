/**
 * StdioMcpToolLister 集成测试（使用假 MCP server）
 */

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { StdioMcpToolLister } from '../../src/main/configuration/infrastructure/StdioMcpToolLister';

const FAKE_SERVER = path.resolve(__dirname, '../helpers/fakeMcpServer.cjs');

describe('StdioMcpToolLister', () => {
  it('返回假 server 的工具列表', async () => {
    const lister = new StdioMcpToolLister();
    const tools = await lister.listTools('fake', {
      command: process.execPath,
      args: [FAKE_SERVER]
    });
    expect(tools.map(t => t.name).sort()).toEqual(['read', 'search']);
    const search = tools.find(t => t.name === 'search')!;
    expect(search.description).toBe('search stuff');
    expect(search.inputSchema).toEqual({ type: 'object' });
  });

  it('server 返回 JSON-RPC error 时抛出', async () => {
    const lister = new StdioMcpToolLister();
    await expect(lister.listTools('fake', {
      command: process.execPath,
      args: [FAKE_SERVER],
      env: { FAKE_MCP_MODE: 'boom' }
    })).rejects.toThrow(/boom from fake server/);
  });

  it('server 无响应时超时', async () => {
    const lister = new StdioMcpToolLister();
    await expect(lister.listTools('fake', {
      command: process.execPath,
      args: [FAKE_SERVER],
      env: { FAKE_MCP_MODE: 'silent' }
    }, 300)).rejects.toThrow(/timed out/);
  }, 5000);

  it('command 不存在时返回报错', async () => {
    const lister = new StdioMcpToolLister();
    await expect(lister.listTools('fake', {
      command: '/nonexistent/binary-should-fail'
    }, 2000)).rejects.toThrow();
  }, 5000);
});
