/**
 * 执行状态值对象
 *
 * @author zhourui
 * @since 2026/03/14
 */

export type ExecutionStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
export type TriggerType = 'manual' | 'scheduled';
