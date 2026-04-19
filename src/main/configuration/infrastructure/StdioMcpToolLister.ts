/**
 * MCP server 工具枚举 stdio 实现
 *
 * 实现最小的 MCP stdio JSON-RPC 客户端，仅用于调用 tools/list：
 * 1. spawn 子进程（command + args + env）
 * 2. 发送 initialize → 等响应
 * 3. 发送 notifications/initialized
 * 4. 发送 tools/list → 等响应
 * 5. 关闭进程
 *
 * 不引入 @modelcontextprotocol/sdk，避免额外依赖。仅支持文本行模式（每条 JSON 一行）。
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import log from '../../shared/infrastructure/logger';
import type { McpServerConfig } from '../domain/model/McpServerConfig';
import type { McpTool } from '../domain/model/McpTool';
import type { McpToolLister } from '../domain/service/McpToolCatalogService';

const PROTOCOL_VERSION = '2024-11-05';
const CLIENT_NAME = 'agent-workflow-mcp-catalog';
const CLIENT_VERSION = '1.0.0';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

export class StdioMcpToolLister implements McpToolLister {
  async listTools(
    server: string,
    config: McpServerConfig,
    timeoutMs = 10_000
  ): Promise<McpTool[]> {
    const child = spawn(config.command, config.args ?? [], {
      env: { ...process.env, ...(config.env ?? {}) },
      stdio: ['pipe', 'pipe', 'pipe']
    }) as ChildProcessWithoutNullStreams;

    const session = new StdioSession(server, child);

    const timeoutHandle = setTimeout(() => {
      session.fail(new Error(`MCP server "${server}" timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    try {
      await session.request('initialize', {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: CLIENT_NAME, version: CLIENT_VERSION }
      });
      session.notify('notifications/initialized', {});
      const toolsResp = (await session.request('tools/list', {})) as {
        tools?: Array<{
          name: string;
          description?: string;
          inputSchema?: Record<string, unknown>;
        }>;
      };
      const tools = (toolsResp.tools ?? []).map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema
      }));
      return tools;
    } finally {
      clearTimeout(timeoutHandle);
      session.close();
    }
  }
}

/**
 * 一次性 stdio JSON-RPC 会话（按行分帧）
 */
class StdioSession {
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private buffer = '';
  private terminalError: Error | null = null;
  private closed = false;
  private readonly stderrChunks: string[] = [];

  constructor(
    private readonly server: string,
    private readonly child: ChildProcessWithoutNullStreams
  ) {
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => this.onStdout(chunk));
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => {
      this.stderrChunks.push(chunk);
    });
    child.on('error', err => this.fail(err));
    child.on('exit', (code, signal) => {
      if (this.closed) return;
      const reason = code !== null ? `exit ${code}` : `signal ${signal}`;
      const stderr = this.stderrChunks.join('').trim().slice(-500);
      const msg = `MCP server "${this.server}" ${reason}${stderr ? `: ${stderr}` : ''}`;
      this.fail(new Error(msg));
    });
  }

  request(method: string, params: unknown): Promise<unknown> {
    if (this.terminalError) return Promise.reject(this.terminalError);
    const id = this.nextId++;
    const frame = JSON.stringify({ jsonrpc: '2.0', method, params, id });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.writeLine(frame);
    });
  }

  notify(method: string, params: unknown): void {
    if (this.terminalError) return;
    const frame = JSON.stringify({ jsonrpc: '2.0', method, params });
    this.writeLine(frame);
  }

  fail(err: Error): void {
    if (this.terminalError) return;
    this.terminalError = err;
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try { this.child.stdin.end(); } catch { /* ignore */ }
    if (this.child.exitCode === null && this.child.signalCode === null) {
      try { this.child.kill('SIGTERM'); } catch { /* ignore */ }
      setTimeout(() => {
        if (this.child.exitCode === null && this.child.signalCode === null) {
          try { this.child.kill('SIGKILL'); } catch { /* ignore */ }
        }
      }, 500).unref();
    }
  }

  private writeLine(frame: string): void {
    try {
      this.child.stdin.write(frame + '\n');
    } catch (err) {
      this.fail(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk;
    let idx: number;
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      this.handleLine(line);
    }
  }

  private handleLine(line: string): void {
    let msg: { id?: number; result?: unknown; error?: { message?: string; code?: number } };
    try {
      msg = JSON.parse(line);
    } catch {
      log.debug('MCP stdout non-JSON line ignored', { server: this.server, line: line.slice(0, 200) });
      return;
    }
    if (typeof msg.id !== 'number') return;
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    this.pending.delete(msg.id);
    if (msg.error) {
      pending.reject(new Error(msg.error.message ?? `MCP error (code ${msg.error.code ?? '?'})`));
    } else {
      pending.resolve(msg.result);
    }
  }
}
