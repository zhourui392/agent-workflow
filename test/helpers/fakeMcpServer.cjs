/* eslint-disable */
/**
 * 极简假 MCP stdio server，用于集成测试 StdioMcpToolLister。
 *
 * 响应 initialize 与 tools/list；支持两种模式：
 *   默认：返回 2 个工具
 *   FAKE_MCP_MODE=boom：tools/list 返回 JSON-RPC error
 *   FAKE_MCP_MODE=silent：不响应（用于超时测试）
 */

const mode = process.env.FAKE_MCP_MODE || 'default';

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      handle(msg);
    } catch (_) {
      // ignore
    }
  }
});

function write(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function handle(msg) {
  if (mode === 'silent') return;
  if (msg.method === 'initialize') {
    write({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'fake', version: '0' }
      }
    });
    return;
  }
  if (msg.method === 'notifications/initialized') return;
  if (msg.method === 'tools/list') {
    if (mode === 'boom') {
      write({
        jsonrpc: '2.0',
        id: msg.id,
        error: { code: -32000, message: 'boom from fake server' }
      });
      return;
    }
    write({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        tools: [
          { name: 'search', description: 'search stuff', inputSchema: { type: 'object' } },
          { name: 'read' }
        ]
      }
    });
    return;
  }
}
