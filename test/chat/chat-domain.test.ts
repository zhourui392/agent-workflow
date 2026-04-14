import { describe, it, expect } from 'vitest';
import { ChatSession, isAgentType } from '../../src/main/chat/domain/model';

describe('ChatSession', () => {
  it('create() generates id, empty messages, no resumeId', () => {
    const s = ChatSession.create('claude', '/tmp/x');
    expect(s.id).toMatch(/[0-9a-f-]{36}/);
    expect(s.agentType).toBe('claude');
    expect(s.workingDir).toBe('/tmp/x');
    expect(s.messages).toHaveLength(0);
    expect(s.resumeId).toBeUndefined();
  });

  it('rejects empty workingDir', () => {
    expect(() => ChatSession.create('claude', '')).toThrow(/workingDir/);
    expect(() => ChatSession.create('claude', '   ')).toThrow(/workingDir/);
  });

  it('addMessage appends in order with timestamps', () => {
    const s = ChatSession.create('codex', '/tmp');
    s.addMessage('user', 'hi');
    s.addMessage('assistant', 'hello');
    expect(s.messages).toHaveLength(2);
    expect(s.messages[0].role).toBe('user');
    expect(s.messages[1].content).toBe('hello');
    expect(s.messages[0].timestamp).toBeInstanceOf(Date);
  });

  it('updateResumeId ignores empty input, trims value', () => {
    const s = ChatSession.create('claude', '/tmp');
    s.updateResumeId('');
    expect(s.resumeId).toBeUndefined();
    s.updateResumeId('  abc-123  ');
    expect(s.resumeId).toBe('abc-123');
  });

  it('fromSnapshot restores state', () => {
    const now = new Date();
    const s = ChatSession.fromSnapshot({
      id: 'sess-1',
      agentType: 'claude',
      workingDir: '/w',
      createdAt: now,
      resumeId: 'r1',
      messages: [{ role: 'user', content: 'q', timestamp: now }]
    });
    expect(s.id).toBe('sess-1');
    expect(s.resumeId).toBe('r1');
    expect(s.messages).toHaveLength(1);
  });
});

describe('isAgentType', () => {
  it.each([
    ['claude', true],
    ['codex', true],
    ['gpt', false],
    ['', false],
    [null, false]
  ])('isAgentType(%p) = %s', (input, expected) => {
    expect(isAgentType(input)).toBe(expected);
  });
});
