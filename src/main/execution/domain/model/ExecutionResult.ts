/**
 * 执行结果值对象
 *
 * @author zhourui
 * @since 2026/03/14
 */

import type { ExecutionStatus } from './ExecutionStatus';
import type { StepEvent } from './StepEvent';

/**
 * 单步执行结果
 */
export interface StepResult {
  success: boolean;
  outputText: string;
  tokensUsed: number;
  errorMessage?: string;
}

/**
 * 步骤输出验证结果
 */
export interface ValidationResult {
  passed: boolean;
  output: string;
  tokensUsed: number;
}

/**
 * 工作流执行结果
 */
export interface ExecutionResult {
  success: boolean;
  totalTokens: number;
  outputs: Record<string, unknown>;
  errorMessage?: string;
}

/**
 * 执行进度事件（用于实时推送到渲染进程）
 */
export interface ExecutionProgressEvent {
  executionId: string;
  stepIndex: number;
  status: ExecutionStatus;
  outputText?: string;
  tokensUsed?: number;
  errorMessage?: string;
  /** 细粒度流式事件 */
  event?: StepEvent;
  /** 父执行 ID（子执行事件专用，用于父页面捕获子执行进度） */
  parentExecutionId?: string;
  /** 父步骤索引（子执行事件专用） */
  parentStepIndex?: number;
  /** 迭代索引（forEach 子执行专用） */
  iterationIndex?: number;
}
