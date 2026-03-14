/**
 * 工作流聚合根
 *
 * 封装工作流的生命周期行为和业务不变量。
 */
import { Entity } from '../../../shared/domain';
import type { WorkflowStep } from './WorkflowStep';
import { isSubWorkflowStep, isAgentStep } from './WorkflowStep';
import type { WorkflowInput } from './WorkflowInput';
import type { WorkflowLimits } from './WorkflowLimits';
import type { WorkflowOutput } from './WorkflowOutput';
import type { FailureStrategy } from './FailureStrategy';
export interface RetryConfig {
  maxAttempts?: number;
  delayMs?: number;
}

export interface CreateWorkflowRequest {
  name: string;
  enabled?: boolean;
  schedule?: string;
  inputs?: WorkflowInput[];
  steps: WorkflowStep[];
  rules?: string;
  skills?: Record<string, string>;
  limits?: WorkflowLimits;
  output?: WorkflowOutput;
  workingDirectory?: string;
  onFailure?: FailureStrategy;
  retryConfig?: RetryConfig;
}

export interface UpdateWorkflowRequest extends Partial<CreateWorkflowRequest> {}

export class Workflow extends Entity {
  readonly name: string;
  private _enabled: boolean;
  readonly schedule?: string;
  readonly inputs?: WorkflowInput[];
  readonly steps: WorkflowStep[];
  readonly rules?: string;
  readonly skills?: Record<string, string>;
  readonly limits?: WorkflowLimits;
  readonly output?: WorkflowOutput;
  readonly workingDirectory?: string;
  readonly onFailure: FailureStrategy;
  readonly retryConfig?: RetryConfig;

  constructor(props: {
    id: string;
    name: string;
    enabled: boolean;
    schedule?: string;
    inputs?: WorkflowInput[];
    steps: WorkflowStep[];
    rules?: string;
    skills?: Record<string, string>;
    limits?: WorkflowLimits;
    output?: WorkflowOutput;
    workingDirectory?: string;
    onFailure: FailureStrategy;
    retryConfig?: RetryConfig;
    createdAt: string;
    updatedAt: string;
  }) {
    super(props.id, props.createdAt, props.updatedAt);
    this.name = props.name;
    this._enabled = props.enabled;
    this.schedule = props.schedule;
    this.inputs = props.inputs;
    this.steps = props.steps;
    this.rules = props.rules;
    this.skills = props.skills;
    this.limits = props.limits;
    this.output = props.output;
    this.workingDirectory = props.workingDirectory;
    this.onFailure = props.onFailure;
    this.retryConfig = props.retryConfig;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  get isSchedulable(): boolean {
    return this._enabled && !!this.schedule && this.schedule.trim().length > 0;
  }

  get stepCount(): number {
    return this.steps.length;
  }

  enable(): void {
    this._enabled = true;
  }

  disable(): void {
    this._enabled = false;
  }

  toggle(): void {
    this._enabled = !this._enabled;
  }

  /**
   * 检查步骤名称是否唯一
   */
  hasUniqueStepNames(): boolean {
    const names = this.steps.map(s => s.name);
    return new Set(names).size === names.length;
  }

  /**
   * 获取重复的步骤名称
   */
  getDuplicateStepNames(): string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const step of this.steps) {
      if (seen.has(step.name)) {
        duplicates.add(step.name);
      }
      seen.add(step.name);
    }
    return Array.from(duplicates);
  }

  /**
   * 根据名称查找步骤索引
   */
  findStepIndex(stepName: string): number {
    return this.steps.findIndex(s => s.name === stepName);
  }

  /**
   * 校验工作流配置的完整性，返回错误列表
   */
  validate(): string[] {
    const errors: string[] = [];

    if (!this.name || this.name.trim().length === 0) {
      errors.push('工作流名称不能为空');
    }

    if (this.steps.length === 0) {
      errors.push('至少需要一个步骤');
    }

    if (!this.hasUniqueStepNames()) {
      const dupes = this.getDuplicateStepNames();
      errors.push(`步骤名称重复: ${dupes.join(', ')}`);
    }

    for (const step of this.steps) {
      if (isSubWorkflowStep(step)) {
        if (!step.workflowId || step.workflowId.trim().length === 0) {
          errors.push(`步骤 "${step.name}" 的 workflowId 不能为空`);
        }
        if (step.forEach) {
          if (!step.forEach.iterateOver || step.forEach.iterateOver.trim().length === 0) {
            errors.push(`步骤 "${step.name}" 的 forEach.iterateOver 不能为空`);
          }
          if (!step.forEach.itemVariable || step.forEach.itemVariable.trim().length === 0) {
            errors.push(`步骤 "${step.name}" 的 forEach.itemVariable 不能为空`);
          }
        }
      } else if (isAgentStep(step)) {
        if (!step.prompt || step.prompt.trim().length === 0) {
          errors.push(`步骤 "${step.name}" 的提示词不能为空`);
        }
      }
    }

    if (this.limits) {
      if (this.limits.maxTokens !== undefined && this.limits.maxTokens <= 0) {
        errors.push('maxTokens 必须为正数');
      }
      if (this.limits.maxTurns !== undefined && this.limits.maxTurns <= 0) {
        errors.push('maxTurns 必须为正数');
      }
      if (this.limits.timeoutMs !== undefined && this.limits.timeoutMs <= 0) {
        errors.push('timeoutMs 必须为正数');
      }
    }

    return errors;
  }
}
