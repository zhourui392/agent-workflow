/**
 * WebSocketSkillGenerationNotifier
 *
 * 实现 SkillGenerationNotifier 接口，通过注入的广播函数把 skill 生成/验证
 * 会话的事件推送给所有连接到 /ws/executions 的客户端。
 *
 * 事件统一携带 kind='skill-generation' 字段，前端据此与工作流执行事件区分。
 */

import type { StepEvent } from '../../execution/domain/model/StepEvent';
import type {
  SkillGenerationNotifier,
  SkillGenerationEvent,
  SkillGenerationPhase
} from '../domain/service/SkillGenerationNotifier';

export type SkillBroadcastFn = (event: SkillGenerationEvent) => void;

export class WebSocketSkillGenerationNotifier implements SkillGenerationNotifier {
  constructor(private readonly broadcastFn: SkillBroadcastFn) {}

  private safeBroadcast(event: SkillGenerationEvent): void {
    try { this.broadcastFn(event); } catch { /* 广播失败不应影响用例 */ }
  }

  start(generationId: string, phase: SkillGenerationPhase): void {
    this.safeBroadcast({
      kind: 'skill-generation',
      generationId,
      phase,
      type: 'start'
    });
  }

  step(generationId: string, phase: SkillGenerationPhase, event: StepEvent): void {
    this.safeBroadcast({
      kind: 'skill-generation',
      generationId,
      phase,
      type: 'step',
      stepEvent: event
    });
  }

  done(generationId: string, phase: SkillGenerationPhase, payload: Record<string, unknown>): void {
    this.safeBroadcast({
      kind: 'skill-generation',
      generationId,
      phase,
      type: phase === 'generating' ? 'generation_done' : 'verification_done',
      payload
    });
  }

  error(generationId: string, phase: SkillGenerationPhase, message: string): void {
    this.safeBroadcast({
      kind: 'skill-generation',
      generationId,
      phase,
      type: 'error',
      errorMessage: message
    });
  }
}
