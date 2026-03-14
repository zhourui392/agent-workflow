/**
 * 工作流步骤定义（值对象）
 *
 * 联合类型：AgentStep（调用 Claude Agent）| SubWorkflowStep（调用子工作流）
 * 向后兼容：无 type 字段的步骤视为 AgentStep。
 */
import type { FailureStrategy } from './FailureStrategy';

/** Agent 步骤 — 调用 Claude Agent 执行提示词 */
export interface AgentStep {
  type?: 'agent';
  name: string;
  prompt: string;
  model?: string;
  maxTurns?: number;
  onFailure?: FailureStrategy;
  retryConfig?: {
    maxAttempts?: number;
    delayMs?: number;
  };
  validation?: {
    prompt?: string;
    rules?: Array<{
      type: 'regex' | 'contains';
      pattern?: string;
      value?: string;
    }>;
  };
  skillIds?: string[];
}

/** forEach 循环配置 */
export interface ForEachConfig {
  iterateOver: string;
  itemVariable: string;
}

/** 子工作流步骤 — 调用另一个工作流（支持 forEach 循环） */
export interface SubWorkflowStep {
  type: 'subWorkflow';
  name: string;
  workflowId: string;
  inputMapping?: Record<string, string>;
  forEach?: ForEachConfig;
  onFailure?: FailureStrategy;
  retryConfig?: {
    maxAttempts?: number;
    delayMs?: number;
  };
}

export type WorkflowStep = AgentStep | SubWorkflowStep;

/** 类型守卫：判断是否为子工作流步骤 */
export function isSubWorkflowStep(step: WorkflowStep): step is SubWorkflowStep {
  return step.type === 'subWorkflow';
}

/** 类型守卫：判断是否为 Agent 步骤 */
export function isAgentStep(step: WorkflowStep): step is AgentStep {
  return !step.type || step.type === 'agent';
}
