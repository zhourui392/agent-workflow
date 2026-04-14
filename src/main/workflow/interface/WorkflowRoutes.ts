/**
 * 工作流 REST 路由
 *
 * 替代原 WorkflowIpcHandler，HTTP 路径与前端 API 层对齐。
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  IdSchema,
  CreateWorkflowSchema,
  UpdateWorkflowSchema,
  RunWorkflowOptionsSchema,
  validateInput
} from '../../shared/interface';
import { workflowToDTO } from '../../shared/interface/dtoMapper';
import type { WorkflowApplicationService } from '../application/WorkflowApplicationService';

export class WorkflowRoutes {
  constructor(private readonly service: WorkflowApplicationService) {}

  register(fastify: FastifyInstance): void {
    fastify.get('/api/workflows', async () => {
      return this.service.list().map(workflowToDTO);
    });

    fastify.get('/api/workflows/:id', async (req: FastifyRequest<{ Params: { id: string } }>) => {
      const id = validateInput(IdSchema, req.params.id);
      const w = this.service.get(id);
      return w ? workflowToDTO(w) : null;
    });

    fastify.post('/api/workflows', async (req: FastifyRequest) => {
      const data = validateInput(CreateWorkflowSchema, req.body);
      return workflowToDTO(this.service.create(data));
    });

    fastify.put('/api/workflows/:id', async (req: FastifyRequest<{ Params: { id: string } }>) => {
      const id = validateInput(IdSchema, req.params.id);
      const data = validateInput(UpdateWorkflowSchema, req.body);
      const w = this.service.update(id, data);
      return w ? workflowToDTO(w) : null;
    });

    fastify.delete('/api/workflows/:id', async (req: FastifyRequest<{ Params: { id: string } }>) => {
      const id = validateInput(IdSchema, req.params.id);
      return this.service.remove(id);
    });

    fastify.post('/api/workflows/:id/toggle', async (req: FastifyRequest<{ Params: { id: string } }>) => {
      const id = validateInput(IdSchema, req.params.id);
      const w = this.service.toggle(id);
      return w ? workflowToDTO(w) : null;
    });

    fastify.post('/api/workflows/:id/clone', async (req: FastifyRequest<{ Params: { id: string } }>) => {
      const id = validateInput(IdSchema, req.params.id);
      const w = this.service.clone(id);
      return w ? workflowToDTO(w) : null;
    });

    fastify.post('/api/workflows/:id/run', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const id = validateInput(IdSchema, req.params.id);
      const validated = validateInput(RunWorkflowOptionsSchema, req.body);
      const executionId = await this.service.run(
        id,
        validated?.inputs || {},
        validated?.workingDirectory ? { workingDirectory: validated.workingDirectory } : undefined
      );
      if (executionId === null) {
        reply.code(404);
        return { error: 'Workflow not found' };
      }
      return { executionId };
    });
  }
}
