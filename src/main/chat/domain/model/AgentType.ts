/**
 * 对接的 CLI Agent 类型
 */
export type AgentType = 'claude' | 'codex';

export const AGENT_TYPES = ['claude', 'codex'] as const;

export function isAgentType(value: unknown): value is AgentType {
  return value === 'claude' || value === 'codex';
}
