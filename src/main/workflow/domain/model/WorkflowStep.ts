/**
 * 工作流步骤定义（值对象）
 */
import type { FailureStrategy } from './FailureStrategy';

export interface WorkflowStep {
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
    prompt: string;
  };
  mcpServerIds?: string[];
  skillIds?: string[];
}
