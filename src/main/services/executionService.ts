/**
 * 执行记录业务服务
 *
 * @author zhourui(V33215020)
 * @since 2026/03/11
 */

import { executionRepository } from '../store/repositories';
import type { Execution, ExecutionListParams } from '../store/models';

/**
 * 查询执行列表
 *
 * @param params 查询参数
 * @returns 执行记录列表
 */
export function list(params?: ExecutionListParams): Execution[] {
  return executionRepository.findAll(params);
}

/**
 * 根据ID获取执行记录（包含步骤详情）
 *
 * @param id 执行ID
 * @returns 执行记录（含步骤执行），不存在则返回null
 */
export function get(id: string): Execution | null {
  return executionRepository.findByIdWithSteps(id);
}
