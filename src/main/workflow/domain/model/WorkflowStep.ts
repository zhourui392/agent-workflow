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

/** 数据拆分模式 */
export type DataSplitMode = 'static' | 'template' | 'ai';

/** 数据拆分步骤 — 将数据拆分为 JSON 数组，供 ForEach 消费 */
export interface DataSplitStep {
  type: 'dataSplit';
  name: string;
  mode: DataSplitMode;
  /** static 模式: JSON 数组字面量 */
  staticData?: string;
  /** template 模式: 模板表达式，如 {{steps.xxx.output}} */
  templateExpr?: string;
  /** ai 模式: 待拆分内容（支持模板表达式） */
  aiInput?: string;
  /** ai 模式: 拆分提示词（可选，默认系统生成） */
  aiPrompt?: string;
  onFailure?: FailureStrategy;
  retryConfig?: {
    maxAttempts?: number;
    delayMs?: number;
  };
}

/** ForEach 循环步骤 — 遍历数组，对每个元素执行 Agent 提示词 */
export interface ForEachStep {
  type: 'forEach';
  name: string;
  prompt: string;
  iterateOver: string;
  itemVariable: string;
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

export type WorkflowStep = AgentStep | SubWorkflowStep | DataSplitStep | ForEachStep;

/** 类型守卫：判断是否为子工作流步骤 */
export function isSubWorkflowStep(step: WorkflowStep): step is SubWorkflowStep {
  return step.type === 'subWorkflow';
}

/** 类型守卫：判断是否为 Agent 步骤 */
export function isAgentStep(step: WorkflowStep): step is AgentStep {
  return !step.type || step.type === 'agent';
}

/** 类型守卫：判断是否为数据拆分步骤 */
export function isDataSplitStep(step: WorkflowStep): step is DataSplitStep {
  return step.type === 'dataSplit';
}

/** 类型守卫：判断是否为 ForEach 循环步骤 */
export function isForEachStep(step: WorkflowStep): step is ForEachStep {
  return step.type === 'forEach';
}
