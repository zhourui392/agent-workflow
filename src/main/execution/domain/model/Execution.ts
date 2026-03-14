/**
 * 执行记录聚合根
 *
 * 封装执行生命周期的状态转换规则和 token 计量逻辑。
 * 状态机: pending → running → success | failed
 */

import { Entity } from '../../../shared/domain';
import type { ExecutionStatus, TriggerType } from './ExecutionStatus';
import type { StepExecution } from './StepExecution';

/**
 * 执行列表查询参数
 */
export interface ExecutionListParams {
  workflowId?: string;
  status?: ExecutionStatus;
  limit?: number;
  offset?: number;
}

/**
 * 合法的状态转换表
 */
const VALID_TRANSITIONS: Record<ExecutionStatus, ExecutionStatus[]> = {
  pending: ['running', 'failed', 'cancelled'],
  running: ['success', 'failed', 'cancelled'],
  success: [],
  failed: [],
  cancelled: []
};

export class Execution extends Entity {
  readonly workflowId: string;
  readonly workflowName?: string;
  readonly triggerType: TriggerType;
  private _status: ExecutionStatus;
  private _finishedAt?: string;
  private _currentStep: number;
  readonly totalSteps?: number;
  private _totalTokens: number;
  private _errorMessage?: string;
  stepExecutions?: StepExecution[];

  constructor(props: {
    id: string;
    workflowId: string;
    workflowName?: string;
    triggerType: TriggerType;
    status: ExecutionStatus;
    startedAt: string;
    finishedAt?: string;
    currentStep: number;
    totalSteps?: number;
    totalTokens: number;
    errorMessage?: string;
    stepExecutions?: StepExecution[];
    updatedAt?: string;
  }) {
    super(props.id, props.startedAt, props.updatedAt ?? props.startedAt);
    this.workflowId = props.workflowId;
    this.workflowName = props.workflowName;
    this.triggerType = props.triggerType;
    this._status = props.status;
    this._finishedAt = props.finishedAt;
    this._currentStep = props.currentStep;
    this.totalSteps = props.totalSteps;
    this._totalTokens = props.totalTokens;
    this._errorMessage = props.errorMessage;
    this.stepExecutions = props.stepExecutions;
  }

  get status(): ExecutionStatus { return this._status; }
  get finishedAt(): string | undefined { return this._finishedAt; }
  get currentStep(): number { return this._currentStep; }
  get totalTokens(): number { return this._totalTokens; }
  get errorMessage(): string | undefined { return this._errorMessage; }

  get isTerminal(): boolean {
    return this._status === 'success' || this._status === 'failed' || this._status === 'cancelled';
  }

  /**
   * 转为运行中状态
   * @throws 当前状态不允许转换时抛出错误
   */
  markRunning(): void {
    this.transitionTo('running');
  }

  /**
   * 标记执行成功
   * @throws 当前状态不允许转换时抛出错误
   */
  markSuccess(): void {
    this.transitionTo('success');
    this._finishedAt = new Date().toISOString();
  }

  /**
   * 标记执行取消
   * @throws 当前状态不允许转换时抛出错误
   */
  markCancelled(): void {
    this.transitionTo('cancelled');
    this._finishedAt = new Date().toISOString();
  }

  /**
   * 标记执行失败
   * @throws 当前状态不允许转换时抛出错误
   */
  markFailed(errorMessage: string): void {
    this.transitionTo('failed');
    this._errorMessage = errorMessage;
    this._finishedAt = new Date().toISOString();
  }

  /**
   * 推进到指定步骤
   * @throws 步骤索引为负数时抛出错误
   */
  advanceStep(stepIndex: number): void {
    if (stepIndex < 0) {
      throw new Error(`步骤索引不能为负数: ${stepIndex}`);
    }
    this._currentStep = stepIndex;
  }

  /**
   * 累加 token 使用量
   * @throws tokens 为负数时抛出错误
   */
  addTokens(tokens: number): void {
    if (tokens < 0) {
      throw new Error(`token 数量不能为负数: ${tokens}`);
    }
    this._totalTokens += tokens;
  }

  /**
   * 检查是否超过 token 限制
   */
  exceedsTokenLimit(maxTokens: number): boolean {
    return this._totalTokens >= maxTokens;
  }

  private transitionTo(target: ExecutionStatus): void {
    const allowed = VALID_TRANSITIONS[this._status];
    if (!allowed.includes(target)) {
      throw new Error(
        `非法状态转换: ${this._status} → ${target}（允许: ${allowed.join(', ') || '无'}）`
      );
    }
    this._status = target;
  }
}
