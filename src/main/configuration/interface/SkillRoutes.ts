/**
 * Skills REST 路由
 *
 * 替代原 SkillIpcHandler。
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  IdSchema,
  CreateSkillSchema,
  UpdateSkillSchema,
  validateInput
} from '../../shared/interface';
import { skillToDTO } from '../../shared/interface/dtoMapper';
import { Skill } from '../domain/model';
import type { SkillApplicationService } from '../application/SkillApplicationService';

export class SkillRoutes {
  constructor(private readonly service: SkillApplicationService) {}

  register(fastify: FastifyInstance): void {
    fastify.get('/api/skills', async () => {
      return this.service.list().map(skillToDTO);
    });

    fastify.get('/api/skills/all', async () => {
      return this.service.listAll().map(item =>
        item instanceof Skill ? skillToDTO(item) : item
      );
    });

    fastify.get('/api/skills/:id', async (req: FastifyRequest<{ Params: { id: string } }>) => {
      const id = validateInput(IdSchema, req.params.id);
      const s = this.service.get(id);
      return s ? skillToDTO(s) : null;
    });

    fastify.post('/api/skills', async (req: FastifyRequest) => {
      const data = validateInput(CreateSkillSchema, req.body);
      return skillToDTO(this.service.create(data));
    });

    fastify.put('/api/skills/:id', async (req: FastifyRequest<{ Params: { id: string } }>) => {
      const id = validateInput(IdSchema, req.params.id);
      const data = validateInput(UpdateSkillSchema, req.body);
      const s = this.service.update(id, data);
      return s ? skillToDTO(s) : null;
    });

    fastify.delete('/api/skills/:id', async (req: FastifyRequest<{ Params: { id: string } }>) => {
      const id = validateInput(IdSchema, req.params.id);
      return this.service.remove(id);
    });

    fastify.patch('/api/skills/:id/enabled', async (req: FastifyRequest<{ Params: { id: string } }>) => {
      const id = validateInput(IdSchema, req.params.id);
      const body = (req.body || {}) as { enabled?: unknown };
      const enabled = validateInput(z.boolean(), body.enabled);
      const s = this.service.setEnabled(id, enabled);
      return s ? skillToDTO(s) : null;
    });
  }
}
