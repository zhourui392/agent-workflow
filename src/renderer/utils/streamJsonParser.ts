/**
 * Claude CLI stream-json → StepEvent[] 解析器（前端纯函数）
 *
 * 支持两条路径：
 * 1) `stream_event`（--include-partial-messages）提供的增量 delta，用于流式实时渲染：
 *    文本边到达边拼、工具调用一开始就能显示、input JSON 边 append 边解析
 * 2) 聚合的 `assistant` / `user` / `result` 消息（turn 结束时）作为兜底与持久化来源
 *
 * 同一条 `message.id` 如果已从 stream_event 累积完成，再遇到聚合 `assistant` 时跳过，避免重复。
 *
 * 输入：按行切分的 stream-json 原文（如 CliAgentGateway 按行推送的 chunks）。
 * 输出：StepEvent[]（init / text / tool_call / tool_result / turn_end / result / error）。
 */

import type { StepEvent } from '../../main/types';

interface RawContentBlock {
  type?: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: unknown;
  tool_use_id?: string;
  is_error?: boolean;
}

interface RawStreamDelta {
  type?: string;
  text?: string;
  partial_json?: string;
  thinking?: string;
}

interface RawStreamInnerEvent {
  type?: string;
  index?: number;
  content_block?: RawContentBlock;
  delta?: RawStreamDelta;
  message?: { id?: string };
}

interface RawMessage {
  type?: string;
  subtype?: string;
  message?: { id?: string; content?: unknown };
  event?: RawStreamInnerEvent;
  tools?: string[];
  model?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  total_cost_usd?: number;
  duration_ms?: number;
  num_turns?: number;
}

interface BlockAccum {
  type: 'text' | 'tool_use' | 'other';
  text: string;
  partialJson: string;
  toolUseId?: string;
  toolName?: string;
}

interface MessageAccum {
  id: string;
  turnIndex: number;
  blockOrder: number[];
  blocks: Map<number, BlockAccum>;
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((b: RawContentBlock) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b: RawContentBlock) => b.text!)
    .join('');
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '...' : s;
}

function tryParseInput(partial: string): Record<string, unknown> {
  if (!partial) return {};
  try {
    const v = JSON.parse(partial);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function emitBlocksFromMessage(
  msg: MessageAccum,
  toolNameMap: Map<string, string>,
  out: StepEvent[]
): void {
  for (const idx of msg.blockOrder) {
    const block = msg.blocks.get(idx);
    if (!block) continue;
    if (block.type === 'text' && block.text) {
      out.push({ type: 'text', text: block.text, turnIndex: msg.turnIndex });
    } else if (block.type === 'tool_use' && block.toolUseId && block.toolName) {
      toolNameMap.set(block.toolUseId, block.toolName);
      out.push({
        type: 'tool_call',
        toolUseId: block.toolUseId,
        toolName: block.toolName,
        input: tryParseInput(block.partialJson),
        turnIndex: msg.turnIndex
      });
    }
  }
}

function extractToolResults(
  content: unknown,
  toolNameMap: Map<string, string>,
  turnIndex: number
): StepEvent[] {
  const out: StepEvent[] = [];
  if (!Array.isArray(content)) return out;
  for (const block of content as RawContentBlock[]) {
    if (!block || block.type !== 'tool_result' || !block.tool_use_id) continue;
    const toolUseId = block.tool_use_id;
    const toolName = toolNameMap.get(toolUseId) ?? 'unknown';
    let output = '';
    if (typeof block.content === 'string') {
      output = block.content;
    } else if (Array.isArray(block.content)) {
      output = (block.content as RawContentBlock[])
        .filter(c => c && c.type === 'text' && typeof c.text === 'string')
        .map(c => c.text!)
        .join('\n');
    }
    out.push({
      type: 'tool_result',
      toolUseId,
      toolName,
      output: truncate(output, 2000),
      isError: !!block.is_error,
      turnIndex
    });
  }
  return out;
}

function processAggregatedAssistant(
  msg: RawMessage,
  turnIndex: number,
  toolNameMap: Map<string, string>,
  out: StepEvent[]
): boolean {
  const content = msg.message?.content;
  let emittedAny = false;

  if (Array.isArray(content)) {
    for (const block of content as RawContentBlock[]) {
      if (!block || typeof block !== 'object') continue;
      if (block.type === 'text' && typeof block.text === 'string' && block.text) {
        out.push({ type: 'text', text: block.text, turnIndex });
        emittedAny = true;
      } else if (block.type === 'tool_use' && block.id && block.name) {
        toolNameMap.set(block.id, block.name);
        out.push({
          type: 'tool_call',
          toolUseId: block.id,
          toolName: block.name,
          input: (block.input ?? {}) as Record<string, unknown>,
          turnIndex
        });
        emittedAny = true;
      }
    }
  } else {
    const text = extractText(content);
    if (text) {
      out.push({ type: 'text', text, turnIndex });
      emittedAny = true;
    }
  }

  if (emittedAny) out.push({ type: 'turn_end', turnIndex });
  return emittedAny;
}

/**
 * 把 Claude CLI 的 stream-json 原始 chunks（每个 chunk 一般是一行）解析为 StepEvent 列表。
 *
 * 优先使用 stream_event 的增量 delta 构建文本/工具调用；当同 message.id 已由 stream_event
 * 完整处理后，再遇到聚合 assistant 消息则跳过，避免重复。
 */
export function parseChunksToEvents(chunks: string[]): StepEvent[] {
  const events: StepEvent[] = [];
  const toolNameMap = new Map<string, string>();
  const completedMessageIds = new Set<string>();

  let turnIndex = 0;
  let current: MessageAccum | null = null;

  for (const raw of chunks) {
    const line = raw.trim();
    if (!line || !line.startsWith('{')) continue;
    let msg: RawMessage;
    try { msg = JSON.parse(line) as RawMessage; }
    catch { continue; }

    if (msg.type === 'system' && msg.subtype === 'init') {
      events.push({ type: 'init', tools: msg.tools ?? [], model: msg.model ?? '' });
      continue;
    }

    if (msg.type === 'stream_event' && msg.event) {
      const ev = msg.event;

      if (ev.type === 'message_start') {
        const id = ev.message?.id;
        if (id) current = { id, turnIndex, blockOrder: [], blocks: new Map() };
        continue;
      }

      if (ev.type === 'content_block_start' && current && ev.index !== undefined) {
        const cb = ev.content_block;
        let block: BlockAccum;
        if (cb?.type === 'text') {
          block = { type: 'text', text: '', partialJson: '' };
        } else if (cb?.type === 'tool_use' && cb.id && cb.name) {
          block = { type: 'tool_use', text: '', partialJson: '', toolUseId: cb.id, toolName: cb.name };
        } else {
          block = { type: 'other', text: '', partialJson: '' };
        }
        current.blocks.set(ev.index, block);
        current.blockOrder.push(ev.index);
        continue;
      }

      if (ev.type === 'content_block_delta' && current && ev.index !== undefined) {
        const block = current.blocks.get(ev.index);
        if (!block) continue;
        const d = ev.delta;
        if (d?.type === 'text_delta' && typeof d.text === 'string') {
          block.text += d.text;
        } else if (d?.type === 'input_json_delta' && typeof d.partial_json === 'string') {
          block.partialJson += d.partial_json;
        }
        continue;
      }

      if (ev.type === 'message_stop' && current) {
        emitBlocksFromMessage(current, toolNameMap, events);
        events.push({ type: 'turn_end', turnIndex: current.turnIndex });
        completedMessageIds.add(current.id);
        turnIndex = Math.max(turnIndex, current.turnIndex + 1);
        current = null;
        continue;
      }

      continue;
    }

    if (msg.type === 'assistant') {
      const id = msg.message?.id;
      if (id && completedMessageIds.has(id)) continue; // already emitted via stream_event
      if (processAggregatedAssistant(msg, turnIndex, toolNameMap, events)) {
        turnIndex++;
        if (id) completedMessageIds.add(id);
      }
      continue;
    }

    if (msg.type === 'user') {
      const results = extractToolResults(msg.message?.content, toolNameMap, turnIndex);
      for (const e of results) events.push(e);
      continue;
    }

    if (msg.type === 'result') {
      const usage = msg.usage;
      events.push({
        type: 'result',
        success: msg.subtype === 'success',
        totalCostUsd: msg.total_cost_usd ?? 0,
        durationMs: msg.duration_ms ?? 0,
        numTurns: msg.num_turns ?? 0,
        inputTokens: usage?.input_tokens ?? 0,
        outputTokens: usage?.output_tokens ?? 0
      });
      continue;
    }

    // error 事件走 stderr，不在此处理
  }

  // 仍在进行中的消息：把当前累积状态作为“活动预览”事件追加，让 UI 边流边渲
  if (current) {
    emitBlocksFromMessage(current, toolNameMap, events);
  }

  return events;
}

export function parseAssistantContentToEvents(content: string): StepEvent[] {
  return parseChunksToEvents(content.split('\n'));
}
