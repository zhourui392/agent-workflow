/**
 * 执行记录 REST 路由
 *
 * 替代原 ExecutionIpcHandler。
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { IdSchema, ExecutionListParamsSchema, RetryExecutionSchema, validateInput } from '../../shared/interface';
import { executionToDTO } from '../../shared/interface/dtoMapper';
import type { QueryExecutionUseCase } from '../application/QueryExecutionUseCase';
import type { CancelExecutionUseCase } from '../application/CancelExecutionUseCase';
import type { RetryExecutionUseCase } from '../application/RetryExecutionUseCase';

type ListQuery = {
  workflowId?: string;
  status?: string;
  limit?: string;
  offset?: string;
};

export class ExecutionRoutes {
  constructor(
    private readonly queryUseCase: QueryExecutionUseCase,
    private readonly cancelUseCase: CancelExecutionUseCase,
    private readonly retryUseCase: RetryExecutionUseCase
  ) {}

  register(fastify: FastifyInstance): void {
    fastify.get('/api/executions', async (req: FastifyRequest<{ Querystring: ListQuery }>) => {
      const q = req.query || {};
      const params = validateInput(ExecutionListParamsSchema, {
        workflowId: q.workflowId || undefined,
        status: q.status || undefined,
        limit: q.limit !== undefined ? Number(q.limit) : undefined,
        offset: q.offset !== undefined ? Number(q.offset) : undefined
      });
      return this.queryUseCase.list(params).map(executionToDTO);
    });

    fastify.get('/api/executions/:id', async (req: FastifyRequest<{ Params: { id: string } }>) => {
      const id = validateInput(IdSchema, req.params.id);
      const e = this.queryUseCase.get(id);
      return e ? executionToDTO(e) : null;
    });

    fastify.get('/api/executions/:id/children', async (req: FastifyRequest<{ Params: { id: string } }>) => {
      const parentId = validateInput(IdSchema, req.params.id);
      return this.queryUseCase.getChildExecutions(parentId).map(executionToDTO);
    });

    fastify.post('/api/executions/:id/cancel', async (req: FastifyRequest<{ Params: { id: string } }>) => {
      const id = validateInput(IdSchema, req.params.id);
      return this.cancelUseCase.cancel(id);
    });

    fastify.post('/api/executions/:id/retry', async (req: FastifyRequest<{ Params: { id: string } }>) => {
      const body = (req.body || {}) as { workingDirectory?: string };
      const validated = validateInput(RetryExecutionSchema, {
        executionId: req.params.id,
        workingDirectory: body.workingDirectory
      });
      return this.retryUseCase.retry(
        validated.executionId,
        validated.workingDirectory ? { workingDirectory: validated.workingDirectory } : undefined
      );
    });
  }
}
