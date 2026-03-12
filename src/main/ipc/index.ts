/**
 * IPC处理器导出与注册
 *
 * @author zhourui(V33215020)
 * @since 2026/03/11
 */

import { registerWorkflowHandlers } from './workflows';
import { registerExecutionHandlers } from './executions';
import { registerConfigHandlers } from './config';
import { registerMcpServerHandlers } from './mcpServers';
import { registerSkillHandlers } from './skills';

/**
 * 注册所有IPC处理器
 */
export function registerAllHandlers(): void {
  registerWorkflowHandlers();
  registerExecutionHandlers();
  registerConfigHandlers();
  registerMcpServerHandlers();
  registerSkillHandlers();
}
