/**
 * 步骤执行记录实体
 *
 * @author zhourui
 * @since 2026/03/14
 */

import { Entity } from '../../../shared/domain';
import type { ExecutionStatus } from './ExecutionStatus';
import type { StepEvent } from './StepEvent';

export class StepExecution extends Entity {
  readonly executionId: string;
  readonly stepIndex: number;
  stepName?: string;
  readonly status: ExecutionStatus;
  readonly promptRendered?: string;
  readonly outputText?: string;
  readonly tokensUsed: number;
  readonly modelUsed?: string;
  readonly errorMessage?: string;
  readonly validationStatus?: 'passed' | 'failed';
  readonly validationOutput?: string;
  readonly events?: StepEvent[];

  constructor(props: {
    id: string;
    executionId: string;
    stepIndex: number;
    stepName?: string;
    status: ExecutionStatus;
    promptRendered?: string;
    outputText?: string;
    tokensUsed: number;
    modelUsed?: string;
    errorMessage?: string;
    validationStatus?: 'passed' | 'failed';
    validationOutput?: string;
    events?: StepEvent[];
    createdAt: string;
    updatedAt: string;
  }) {
    super(props.id, props.createdAt, props.updatedAt);
    this.executionId = props.executionId;
    this.stepIndex = props.stepIndex;
    this.stepName = props.stepName;
    this.status = props.status;
    this.promptRendered = props.promptRendered;
    this.outputText = props.outputText;
    this.tokensUsed = props.tokensUsed;
    this.modelUsed = props.modelUsed;
    this.errorMessage = props.errorMessage;
    this.validationStatus = props.validationStatus;
    this.validationOutput = props.validationOutput;
    this.events = props.events;
  }
}
