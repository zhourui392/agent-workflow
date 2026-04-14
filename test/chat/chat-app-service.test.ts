import { describe, it, expect, beforeEach } from 'vitest';
import { ChatApplicationService, extractResumeIdFromChunk } from '../../src/main/chat/application/ChatApplicationService';
import { InMemorySessionRepository } from '../../src/main/chat/infrastructure/InMemorySessionRepository';
import type { AgentGateway, RunStreamRequest } from '../../src/main/chat/domain/service/AgentGateway';

class FakeGateway implements AgentGateway {
  lastRequest: RunStreamRequest | null = null;
  running = new Set<string>();
  chunks: string[] = [];
  exitCode = 0;

  runStream(req: RunStreamRequest): void {
    this.lastRequest = req;
    this.running.add(req.sessionId);
    // 模拟异步流式输出
    setImmediate(() => {
      for (const c of this.chunks) req.onChunk(c);
      this.running.delete(req.sessionId);
      req.onExit(this.exitCode);
    });
  }

  stopStream(sessionId: string): boolean {
    return this.running.delete(sessionId);
  }

  isRunning(sessionId: string): boolean {
    return this.running.has(sessionId);
  }
}

describe('extractResumeIdFromChunk', () => {
  it('extracts top-level session_id', () => {
    expect(extractResumeIdFromChunk('{"session_id":"abc","foo":1}')).toBe('abc');
  });
  it('extracts camelCase sessionId', () => {
    expect(extractResumeIdFromChunk('{"sessionId":"xyz"}')).toBe('xyz');
  });
  it('returns undefined for non-JSON', () => {
    expect(extractResumeIdFromChunk('plain text line')).toBeUndefined();
  });
  it('returns undefined when session_id missing', () => {
    expect(extractResumeIdFromChunk('{"other":"v"}')).toBeUndefined();
  });
  it('returns undefined for empty string session_id', () => {
    expect(extractResumeIdFromChunk('{"session_id":""}')).toBeUndefined();
  });
});

describe('ChatApplicationService', () => {
  let repo: InMemorySessionRepository;
  let gateway: FakeGateway;
  let service: ChatApplicationService;

  beforeEach(() => {
    repo = new InMemorySessionRepository();
    gateway = new FakeGateway();
    service = new ChatApplicationService(repo, gateway);
  });

  it('startSession creates and persists a session', () => {
    const s = service.startSession('claude', '/tmp/work');
    expect(s.agentType).toBe('claude');
    expect(repo.find(s.id)).not.toBeNull();
  });

  it('streamMessage records user message before dispatching', () => {
    const s = service.startSession('claude', '/tmp');
    service.streamMessage(s.id, 'hello', undefined, {
      onChunk: () => {},
      onExit: () => {}
    });
    const msgs = repo.find(s.id)!.messages;
    expect(msgs[0].role).toBe('user');
    expect(msgs[0].content).toBe('hello');
  });

  it('streamMessage errors when session is missing', () => {
    let errMsg = '';
    let exitCode = 0;
    service.streamMessage('missing', 'x', undefined, {
      onChunk: () => {},
      onExit: (c) => { exitCode = c; },
      onError: (e) => { errMsg = e.message; }
    });
    expect(errMsg).toMatch(/Session not found/);
    expect(exitCode).toBe(-1);
  });

  it('forwards chunks and writes assistant message on exit', async () => {
    const s = service.startSession('codex', '/tmp');
    gateway.chunks = ['line1', 'line2'];

    const received: string[] = [];
    await new Promise<void>((resolve) => {
      service.streamMessage(s.id, 'q', undefined, {
        onChunk: (c) => received.push(c),
        onExit: () => resolve()
      });
    });

    expect(received).toEqual(['line1', 'line2']);
    const msgs = repo.find(s.id)!.messages;
    expect(msgs.map(m => m.role)).toEqual(['user', 'assistant']);
    expect(msgs[1].content).toBe('line1\nline2');
  });

  it('auto-extracts resumeId from first JSON chunk containing session_id', async () => {
    const s = service.startSession('claude', '/tmp');
    gateway.chunks = [
      '{"type":"system","session_id":"resume-xyz"}',
      'plain line'
    ];

    await new Promise<void>((resolve) => {
      service.streamMessage(s.id, 'q', undefined, {
        onChunk: () => {},
        onExit: () => resolve()
      });
    });

    expect(repo.find(s.id)!.resumeId).toBe('resume-xyz');
  });

  it('passes resumeId on subsequent calls', async () => {
    const s = service.startSession('claude', '/tmp');
    s.updateResumeId('prev-id');
    repo.save(s);

    service.streamMessage(s.id, 'q', undefined, { onChunk: () => {}, onExit: () => {} });
    expect(gateway.lastRequest?.resumeId).toBe('prev-id');
  });

  it('stopSession delegates to gateway', () => {
    const s = service.startSession('claude', '/tmp');
    gateway.running.add(s.id);
    expect(service.stopSession(s.id)).toBe(true);
    expect(service.isRunning(s.id)).toBe(false);
  });

  it('deleteSession stops and removes', () => {
    const s = service.startSession('claude', '/tmp');
    gateway.running.add(s.id);
    expect(service.deleteSession(s.id)).toBe(true);
    expect(repo.find(s.id)).toBeNull();
  });
});
