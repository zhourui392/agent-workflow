/**
 * Claude CLI stream-json → StepEvent[] 解析器（前端纯函数）
 *
 * 逻辑移植自 src/main/execution/infrastructure/ClaudeAgentExecutor.ts 的
 * processStreamMessage / processAssistantMessage / extractToolResults。
 * 与工作流执行共享同一套事件模型，以便复用 StepEventViewer 组件。
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

interface RawMessage {
  type?: string;
  subtype?: string;
  message?: { content?: unknown };
  tools?: string[];
  model?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  total_cost_usd?: number;
  duration_ms?: number;
  num_turns?: number;
}

interface ParseContext {
  turnIndex: number;
  toolNameMap: Map<string, string>;
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

function processAssistant(
  msg: RawMessage,
  ctx: ParseContext,
  emit: (e: StepEvent) => void
): void {
  const content = msg.message?.content;
  let emittedAny = false;

  if (Array.isArray(content)) {
    for (const block of content as RawContentBlock[]) {
      if (!block || typeof block !== 'object') continue;
      if (block.type === 'text' && typeof block.text === 'string' && block.text) {
        emit({ type: 'text', text: block.text, turnIndex: ctx.turnIndex });
        emittedAny = true;
      } else if (block.type === 'tool_use' && block.id && block.name) {
        ctx.toolNameMap.set(block.id, block.name);
        emit({
          type: 'tool_call',
          toolUseId: block.id,
          toolName: block.name,
          input: (block.input ?? {}) as Record<string, unknown>,
          turnIndex: ctx.turnIndex
        });
        emittedAny = true;
      }
    }
  } else {
    const text = extractText(content);
    if (text) {
      emit({ type: 'text', text, turnIndex: ctx.turnIndex });
      emittedAny = true;
    }
  }

  if (emittedAny) {
    emit({ type: 'turn_end', turnIndex: ctx.turnIndex });
    ctx.turnIndex++;
  }
}

function processMessage(
  msg: RawMessage,
  ctx: ParseContext,
  emit: (e: StepEvent) => void
): void {
  if (msg.type === 'system' && msg.subtype === 'init') {
    emit({ type: 'init', tools: msg.tools ?? [], model: msg.model ?? '' });
    return;
  }
  if (msg.type === 'assistant') {
    processAssistant(msg, ctx, emit);
    return;
  }
  if (msg.type === 'user') {
    const events = extractToolResults(msg.message?.content, ctx.toolNameMap, ctx.turnIndex);
    for (const e of events) emit(e);
    return;
  }
  if (msg.type === 'result') {
    const usage = msg.usage;
    emit({
      type: 'result',
      success: msg.subtype === 'success',
      totalCostUsd: msg.total_cost_usd ?? 0,
      durationMs: msg.duration_ms ?? 0,
      numTurns: msg.num_turns ?? 0,
      inputTokens: usage?.input_tokens ?? 0,
      outputTokens: usage?.output_tokens ?? 0
    });
    return;
  }
  // stream_event（--include-partial-messages）会被 assistant/user/result 聚合消息覆盖，此处忽略
  // error 事件由 CLI 走 stderr，不在此处处理
}

/**
 * 把 Claude CLI 的 stream-json 原始 chunks（每个 chunk 一般是一行）解析为 StepEvent 列表。
 */
export function parseChunksToEvents(chunks: string[]): StepEvent[] {
  const events: StepEvent[] = [];
  const ctx: ParseContext = { turnIndex: 0, toolNameMap: new Map() };

  for (const raw of chunks) {
    const line = raw.trim();
    if (!line || !line.startsWith('{')) continue;
    let msg: RawMessage;
    try { msg = JSON.parse(line) as RawMessage; }
    catch { continue; }
    processMessage(msg, ctx, e => events.push(e));
  }

  return events;
}

export function parseAssistantContentToEvents(content: string): StepEvent[] {
  return parseChunksToEvents(content.split('\n'));
}
