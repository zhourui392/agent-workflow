/**
 * 步骤流式事件值对象
 *
 * 定义步骤执行过程中的所有流式事件类型。
 *
 * @author zhourui
 * @since 2026/03/14
 */

/** 事件类型枚举 */
export type StepEventType =
  | 'init'
  | 'text'
  | 'tool_call'
  | 'tool_result'
  | 'turn_end'
  | 'result'
  | 'error';

/** 初始化事件 */
export interface InitEvent {
  type: 'init';
  tools: string[];
  mcpServers: { name: string; status: string }[];
  model: string;
}

/** 文本回复事件 */
export interface TextEvent {
  type: 'text';
  text: string;
  turnIndex: number;
}

/** 工具调用事件 */
export interface ToolCallEvent {
  type: 'tool_call';
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
  turnIndex: number;
}

/** 工具结果事件 */
export interface ToolResultEvent {
  type: 'tool_result';
  toolUseId: string;
  toolName: string;
  output: string;
  isError: boolean;
  turnIndex: number;
}

/** 一轮结束事件 */
export interface TurnEndEvent {
  type: 'turn_end';
  turnIndex: number;
}

/** 最终结果事件 */
export interface ResultEvent {
  type: 'result';
  success: boolean;
  totalCostUsd: number;
  durationMs: number;
  numTurns: number;
  inputTokens: number;
  outputTokens: number;
}

/** 错误事件 */
export interface ErrorEvent {
  type: 'error';
  message: string;
}

/** 步骤流式事件联合类型 */
export type StepEvent =
  | InitEvent
  | TextEvent
  | ToolCallEvent
  | ToolResultEvent
  | TurnEndEvent
  | ResultEvent
  | ErrorEvent;
