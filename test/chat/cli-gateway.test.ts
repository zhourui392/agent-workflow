import { describe, it, expect } from 'vitest';
import { CliAgentGateway } from '../../src/main/chat/infrastructure/CliAgentGateway';
import { ChatConfig } from '../../src/main/chat/infrastructure/ChatConfig';

/**
 * 集成测试：用 node 自身作为 fake CLI。通过注入 NODE_PATH 为 node 命令 + 一段
 * 内联 JS，验证 CliAgentGateway 的 spawn/stdin/stdout/超时/终止逻辑。
 */
function makeConfig(overrides: NodeJS.ProcessEnv = {}): ChatConfig {
  return new ChatConfig({
    CLAUDE_CLI_CMD: 'node',
    CLAUDE_CLI_ARGS: '',
    CLAUDE_CLI_STDIN: 'true',
    CLAUDE_CLI_TIMEOUT_SECONDS: '0',
    CODEX_CLI_CMD: 'node',
    CODEX_CLI_ARGS: '',
    CODEX_CLI_STDIN: 'true',
    CODEX_CLI_TIMEOUT_SECONDS: '0',
    ...overrides
  });
}

// Use a fake CLI that echoes its stdin line-by-line
const ECHO_SCRIPT = `
let buf='';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', d => buf += d);
process.stdin.on('end', () => {
  for (const line of buf.split('\\n')) {
    if (line) console.log('echo:' + line);
  }
  console.log('{"session_id":"sess-from-cli"}');
});
`;

describe('CliAgentGateway (integration with fake CLI)', () => {
  it('spawns process, writes stdin, reads stdout line by line, fires onExit', async () => {
    const config = makeConfig();
    // 通过 args 模板注入 inline 脚本
    (config as unknown as { claude: { args: string[] } }).claude.args = ['-e', ECHO_SCRIPT];

    const gw = new CliAgentGateway(config);
    const chunks: string[] = [];
    let exitCode: number | null = null;

    await new Promise<void>((resolve) => {
      gw.runStream({
        sessionId: 'test-1',
        agentType: 'claude',
        workingDir: process.cwd(),
        message: 'hello\nworld',
        onChunk: (c) => chunks.push(c),
        onExit: (code) => { exitCode = code; resolve(); }
      });
    });

    expect(exitCode).toBe(0);
    expect(chunks).toContain('echo:hello');
    expect(chunks).toContain('echo:world');
    expect(chunks.some(c => c.includes('session_id'))).toBe(true);
    expect(gw.isRunning('test-1')).toBe(false);
  });

  it('injects env prefix before user message', async () => {
    const config = makeConfig({
      AGENT_ENV_PROMPTS_JSON: JSON.stringify([{ key: 'prod', prompt: '[PROD]' }])
    });
    (config as unknown as { claude: { args: string[] } }).claude.args = [
      '-e',
      `let b=''; process.stdin.setEncoding('utf8'); process.stdin.on('data',d=>b+=d); process.stdin.on('end',()=>console.log('got:'+b));`
    ];

    const gw = new CliAgentGateway(config);
    const chunks: string[] = [];

    await new Promise<void>((resolve) => {
      gw.runStream({
        sessionId: 'test-env',
        agentType: 'claude',
        workingDir: process.cwd(),
        message: 'hi',
        env: 'prod',
        onChunk: (c) => chunks.push(c),
        onExit: () => resolve()
      });
    });

    expect(chunks[0]).toBe('got:[PROD]hi');
  });

  it('stopStream kills running process', async () => {
    const config = makeConfig();
    (config as unknown as { claude: { args: string[] } }).claude.args = [
      '-e',
      `setInterval(() => console.log('tick'), 50);`
    ];
    const gw = new CliAgentGateway(config);
    let exitCode: number | null = null;

    const done = new Promise<void>((resolve) => {
      gw.runStream({
        sessionId: 'test-kill',
        agentType: 'claude',
        workingDir: process.cwd(),
        message: '',
        onChunk: () => {},
        onExit: (code) => { exitCode = code; resolve(); }
      });
    });

    // 等 100ms 让进程跑起来
    await new Promise(r => setTimeout(r, 100));
    expect(gw.stopStream('test-kill')).toBe(true);
    await done;
    expect(exitCode).not.toBe(0);
  }, 5000);
});
