/**
 * 查询执行记录用例
 *
 * @author zhourui
 * @since 2026/03/14
 */

import type { Execution, ExecutionListParams } from '../domain/model';
import type { ExecutionRepository } from '../domain/repository/ExecutionRepository';

export class QueryExecutionUseCase {
  constructor(private readonly repo: ExecutionRepository) {}

  list(params?: ExecutionListParams): Execution[] {
    return this.repo.findAll(params);
  }

  get(id: string): Execution | null {
    return this.repo.findByIdWithSteps(id);
  }

  getChildExecutions(parentExecutionId: string): Execution[] {
    return this.repo.findByParentExecutionId(parentExecutionId);
  }
}
