/**
 * 工作流限制配置（值对象）
 */
export interface WorkflowLimits {
  maxTurns?: number;
  timeoutMs?: number;
}
