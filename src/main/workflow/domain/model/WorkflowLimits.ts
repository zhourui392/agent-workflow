/**
 * 工作流限制配置（值对象）
 */
export interface WorkflowLimits {
  maxTokens?: number;
  maxTurns?: number;
  timeoutMs?: number;
}
