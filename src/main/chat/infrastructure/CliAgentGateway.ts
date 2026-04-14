/**
 * CLI Agent 网关实现
 *
 * 移植自 agent-web 的 AgentCliGateway.java。通过 child_process.spawn 启动
 * Claude / Codex CLI，按行读取 stdout 并推送给 onChunk。每个 session 同一时间
 * 只有一个进程；stopStream 会强制终止。
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import type { AgentGateway, RunStreamRequest } from '../domain/service/AgentGateway';
import type { ChatConfig } from './ChatConfig';
import log from '../../shared/infrastructure/logger';

export class CliAgentGateway implements AgentGateway {
  private readonly running = new Map<string, ChildProcessWithoutNullStreams>();

  constructor(private readonly config: ChatConfig) {}

  runStream(req: RunStreamRequest): void {
    const spec = this.config.getSpec(req.agentType);

    // 构造参数：固定参数 + --resume（仅 Claude） + 可选的 ${MESSAGE} 占位替换
    const args: string[] = [];
    for (const a of spec.args) {
      if (a.includes('${MESSAGE}')) {
        args.push(a.replace('${MESSAGE}', req.message));
      } else {
        args.push(a);
      }
    }
    if (req.agentType === 'claude' && req.resumeId && req.resumeId.trim() !== '') {
      args.push('--resume', req.resumeId.trim());
    }

    // 如前一个进程还在，先终止
    const prev = this.running.get(req.sessionId);
    if (prev && !prev.killed) {
      try { prev.kill('SIGKILL'); } catch { /* noop */ }
    }

    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(spec.exec, args, {
        cwd: req.workingDir,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (err) {
      req.onError?.(err instanceof Error ? err : new Error(String(err)));
      req.onExit(-1);
      return;
    }

    this.running.set(req.sessionId, child);
    log.info(`Started ${req.agentType} CLI pid=${child.pid} session=${req.sessionId}`);

    // 超时看门狗
    let watchdog: NodeJS.Timeout | null = null;
    if (spec.timeoutSeconds > 0) {
      watchdog = setTimeout(() => {
        try { req.onChunk('[timeout]\n'); } catch { /* noop */ }
        try { child.kill('SIGKILL'); } catch { /* noop */ }
      }, spec.timeoutSeconds * 1000);
    }

    // stdin: 环境前缀 + 用户消息
    if (spec.stdin) {
      const envEntry = this.config.findEnvEntry(req.env);
      const envPrefix = envEntry?.prompt ?? '';
      const fullMessage = envPrefix + req.message;
      try {
        child.stdin.write(fullMessage);
        child.stdin.end();
      } catch (err) {
        log.warn('Failed to write stdin to CLI', err);
      }
    } else {
      try { child.stdin.end(); } catch { /* noop */ }
    }

    // 逐行读取 stdout
    let stdoutBuf = '';
    child.stdout.setEncoding('utf-8');
    child.stdout.on('data', (data: string) => {
      stdoutBuf += data;
      let idx: number;
      while ((idx = stdoutBuf.indexOf('\n')) >= 0) {
        const line = stdoutBuf.slice(0, idx);
        stdoutBuf = stdoutBuf.slice(idx + 1);
        if (line.trim() !== '') {
          try { req.onChunk(line); } catch { /* listener errors swallowed */ }
        }
      }
    });

    // stderr 合并到日志
    child.stderr.setEncoding('utf-8');
    child.stderr.on('data', (data: string) => {
      log.debug(`CLI stderr [${req.sessionId}]: ${data}`);
    });

    child.on('error', (err: Error) => {
      if (watchdog) clearTimeout(watchdog);
      this.running.delete(req.sessionId);
      log.error(`CLI spawn error session=${req.sessionId}`, err);
      req.onError?.(err);
      req.onExit(-1);
    });

    child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      if (watchdog) clearTimeout(watchdog);
      // flush 尾行
      if (stdoutBuf.trim() !== '') {
        try { req.onChunk(stdoutBuf); } catch { /* noop */ }
        stdoutBuf = '';
      }
      this.running.delete(req.sessionId);
      log.info(`CLI exited session=${req.sessionId} code=${code} signal=${signal}`);
      // 信号退出（例如 SIGKILL）时 code 为 null，统一映射为 -1
      req.onExit(code ?? -1);
    });
  }

  stopStream(sessionId: string): boolean {
    const child = this.running.get(sessionId);
    if (!child) return false;
    try {
      child.kill('SIGKILL');
    } catch { /* noop */ }
    this.running.delete(sessionId);
    return true;
  }

  isRunning(sessionId: string): boolean {
    const child = this.running.get(sessionId);
    return !!child && !child.killed;
  }
}
