/**
 * Skills REST 路由
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  IdSchema,
  UpdateSkillSchema,
  GenerateSkillSchema,
  VerifySkillSchema,
  SaveSkillFromDraftSchema,
  validateInput
} from '../../shared/interface';
import { skillToDTO } from '../../shared/interface/dtoMapper';
import { Skill } from '../domain/model';
import {
  SkillApplicationService,
  SkillDraftNotFoundError,
  SkillDraftStateError,
  SkillNameConflictError
} from '../application/SkillApplicationService';
import type { GenerateSkillUseCase } from '../application/GenerateSkillUseCase';
import type { VerifySkillUseCase } from '../application/VerifySkillUseCase';
import type { SkillDraftStore } from '../domain/repository/SkillDraftStore';
import type { SkillDraft } from '../domain/model/SkillDraft';

function draftToDTO(draft: SkillDraft) {
  return {
    generationId: draft.generationId,
    status: draft.status,
    draftName: draft.draftName,
    draftDir: draft.draftDir,
    suggestedTests: draft.suggestedTests,
    errorMessage: draft.errorMessage,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt
  };
}

export class SkillRoutes {
  constructor(
    private readonly service: SkillApplicationService,
    private readonly generateUseCase: GenerateSkillUseCase,
    private readonly verifyUseCase: VerifySkillUseCase,
    private readonly draftStore: SkillDraftStore
  ) {}

  register(fastify: FastifyInstance): void {
    fastify.get('/api/skills', async () => {
      return this.service.list().map(skillToDTO);
    });

    fastify.get('/api/skills/all', async () => {
      return this.service.listAll().map(item =>
        item instanceof Skill ? skillToDTO(item) : item
      );
    });

    fastify.post('/api/skills/generate', async (req: FastifyRequest, reply: FastifyReply) => {
      const data = validateInput(GenerateSkillSchema, req.body);
      try {
        const { generationId } = await this.generateUseCase.start(data.prompt, data.model);
        return { generationId };
      } catch (error) {
        reply.code(400);
        return { error: error instanceof Error ? error.message : String(error) };
      }
    });

    fastify.get('/api/skills/generate/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const id = validateInput(IdSchema, req.params.id);
      const draft = this.draftStore.get(id);
      if (!draft) {
        reply.code(404);
        return { error: 'generationId 不存在或已过期' };
      }
      return draftToDTO(draft);
    });

    fastify.post('/api/skills/generate/:id/verify', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const id = validateInput(IdSchema, req.params.id);
      const data = validateInput(VerifySkillSchema, req.body);
      try {
        await this.verifyUseCase.start(id, data.testPrompt, data.model);
        reply.code(202);
        return { generationId: id };
      } catch (error) {
        reply.code(400);
        return { error: error instanceof Error ? error.message : String(error) };
      }
    });

    fastify.post('/api/skills/generate/:id/save', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const id = validateInput(IdSchema, req.params.id);
      const data = validateInput(SaveSkillFromDraftSchema, req.body ?? {});
      try {
        const skill = this.service.saveFromDraft(id, data);
        return skillToDTO(skill);
      } catch (error) {
        if (error instanceof SkillDraftNotFoundError) {
          reply.code(404);
          return { error: error.message };
        }
        if (error instanceof SkillNameConflictError) {
          reply.code(409);
          return { error: error.message };
        }
        if (error instanceof SkillDraftStateError) {
          reply.code(400);
          return { error: error.message };
        }
        throw error;
      }
    });

    fastify.post('/api/skills/generate/:id/cancel', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const id = validateInput(IdSchema, req.params.id);
      const removed = this.service.cancelDraft(id);
      if (!removed) {
        reply.code(404);
        return { error: 'generationId 不存在或已过期' };
      }
      reply.code(204);
      return null;
    });

    fastify.get('/api/skills/:id', async (req: FastifyRequest<{ Params: { id: string } }>) => {
      const id = validateInput(IdSchema, req.params.id);
      const s = this.service.get(id);
      return s ? skillToDTO(s) : null;
    });

    // 手填创建已废弃，改由 /api/skills/generate 流程
    fastify.post('/api/skills', async (_req: FastifyRequest, reply: FastifyReply) => {
      reply.code(501);
      return { error: '手填创建已废弃，请使用 POST /api/skills/generate 通过 AI 生成 Skill' };
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
