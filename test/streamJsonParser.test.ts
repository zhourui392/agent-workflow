import { describe, it, expect } from 'vitest';
import { parseChunksToEvents } from '../src/renderer/utils/streamJsonParser';
import type { TextEvent, ToolCallEvent, ToolResultEvent } from '../src/main/types';

function j(obj: unknown): string { return JSON.stringify(obj); }

describe('parseChunksToEvents - legacy aggregated messages', () => {
  it('emits text event from aggregated assistant message', () => {
    const chunks = [
      j({ type: 'assistant', message: { id: 'm1', content: [{ type: 'text', text: 'hello' }] } })
    ];
    const events = parseChunksToEvents(chunks);
    const text = events.find(e => e.type === 'text') as TextEvent | undefined;
    expect(text?.text).toBe('hello');
  });

  it('emits tool_call from aggregated assistant + tool_result from aggregated user', () => {
    const chunks = [
      j({
        type: 'assistant',
        message: {
          id: 'm1',
          content: [
            { type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: 'ls' } }
          ]
        }
      }),
      j({
        type: 'user',
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 'tu1', content: 'file.txt' }
          ]
        }
      })
    ];
    const events = parseChunksToEvents(chunks);
    const call = events.find(e => e.type === 'tool_call') as ToolCallEvent | undefined;
    const result = events.find(e => e.type === 'tool_result') as ToolResultEvent | undefined;
    expect(call?.toolName).toBe('Bash');
    expect(call?.input).toEqual({ command: 'ls' });
    expect(result?.toolUseId).toBe('tu1');
    expect(result?.output).toBe('file.txt');
  });
});

describe('parseChunksToEvents - incremental stream_event (live rendering)', () => {
  it('accumulates text_delta into a text event before message_stop', () => {
    const chunks = [
      j({ type: 'stream_event', event: { type: 'message_start', message: { id: 'm1' } } }),
      j({ type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } }),
      j({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hel' } } }),
      j({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'lo' } } })
    ];
    const events = parseChunksToEvents(chunks);
    const texts = events.filter(e => e.type === 'text') as TextEvent[];
    expect(texts).toHaveLength(1);
    expect(texts[0].text).toBe('Hello');
  });

  it('emits tool_call as soon as content_block_start for tool_use arrives', () => {
    const chunks = [
      j({ type: 'stream_event', event: { type: 'message_start', message: { id: 'm1' } } }),
      j({ type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu1', name: 'Read', input: {} } } })
    ];
    const events = parseChunksToEvents(chunks);
    const calls = events.filter(e => e.type === 'tool_call') as ToolCallEvent[];
    expect(calls).toHaveLength(1);
    expect(calls[0].toolName).toBe('Read');
    expect(calls[0].toolUseId).toBe('tu1');
  });

  it('accumulates input_json_delta into tool_call input', () => {
    const chunks = [
      j({ type: 'stream_event', event: { type: 'message_start', message: { id: 'm1' } } }),
      j({ type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu1', name: 'Bash', input: {} } } }),
      j({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"command":"' } } }),
      j({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: 'ls -la"}' } } })
    ];
    const events = parseChunksToEvents(chunks);
    const call = events.find(e => e.type === 'tool_call') as ToolCallEvent | undefined;
    expect(call?.input).toEqual({ command: 'ls -la' });
  });

  it('deduplicates: when aggregated assistant with same id follows stream_event, does not double-emit', () => {
    const chunks = [
      j({ type: 'stream_event', event: { type: 'message_start', message: { id: 'm1' } } }),
      j({ type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } }),
      j({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'hello' } } }),
      j({ type: 'stream_event', event: { type: 'content_block_stop', index: 0 } }),
      j({ type: 'stream_event', event: { type: 'message_stop' } }),
      j({ type: 'assistant', message: { id: 'm1', content: [{ type: 'text', text: 'hello' }] } })
    ];
    const events = parseChunksToEvents(chunks);
    const texts = events.filter(e => e.type === 'text') as TextEvent[];
    expect(texts).toHaveLength(1);
    expect(texts[0].text).toBe('hello');
  });

  it('emits turn_end on message_stop', () => {
    const chunks = [
      j({ type: 'stream_event', event: { type: 'message_start', message: { id: 'm1' } } }),
      j({ type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } }),
      j({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'x' } } }),
      j({ type: 'stream_event', event: { type: 'message_stop' } })
    ];
    const events = parseChunksToEvents(chunks);
    expect(events.some(e => e.type === 'turn_end')).toBe(true);
  });

  it('ignores thinking blocks (not emitted as text/tool)', () => {
    const chunks = [
      j({ type: 'stream_event', event: { type: 'message_start', message: { id: 'm1' } } }),
      j({ type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } } }),
      j({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'pondering' } } })
    ];
    const events = parseChunksToEvents(chunks);
    const texts = events.filter(e => e.type === 'text');
    const calls = events.filter(e => e.type === 'tool_call');
    expect(texts).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });
});
