/**
 * SkillGenerationNotifier 接口
 *
 * 将 skill 生成/验证会话的实时事件广播给前端。
 * 基础设施层实现（WebSocket）通过 server.ts 的共享 broadcast 函数发送。
 */

import type { StepEvent } from '../../../execution/domain/model/StepEvent';

export type SkillGenerationPhase = 'generating' | 'verifying';

export type SkillGenerationEventType =
  | 'start'
  | 'step'
  | 'generation_done'
  | 'verification_done'
  | 'error';

/**
 * 统一广播到 /ws/executions，前端通过 kind 字段区分。
 */
export interface SkillGenerationEvent {
  kind: 'skill-generation';
  generationId: string;
  phase: SkillGenerationPhase;
  type: SkillGenerationEventType;
  /** step 事件透传；generation_done / verification_done 携带结构化 payload */
  stepEvent?: StepEvent;
  payload?: Record<string, unknown>;
  errorMessage?: string;
}

export interface SkillGenerationNotifier {
  start(generationId: string, phase: SkillGenerationPhase): void;
  step(generationId: string, phase: SkillGenerationPhase, event: StepEvent): void;
  done(generationId: string, phase: SkillGenerationPhase, payload: Record<string, unknown>): void;
  error(generationId: string, phase: SkillGenerationPhase, message: string): void;
}
