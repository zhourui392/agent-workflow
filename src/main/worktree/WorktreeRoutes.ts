/**
 * Worktree REST 路由
 *
 * - POST   /api/worktree/switch   { workspacePath, branch } → { worktreePath, branch, repos[] }
 * - POST   /api/worktree/update   { workspacePath, branch } → { branch, repos[] }
 * - DELETE /api/worktree/remove   ?workspacePath=&branch=   → { success }
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { WorktreeService } from './WorktreeService';

interface SwitchBody { workspacePath?: string; branch?: string }
interface UpdateBody { workspacePath?: string; branch?: string }
interface RemoveQs { workspacePath?: string; branch?: string }

export class WorktreeRoutes {
  constructor(private readonly service: WorktreeService) {}

  register(fastify: FastifyInstance): void {
    fastify.post('/api/worktree/switch', async (req: FastifyRequest<{ Body: SwitchBody }>, reply: FastifyReply) => {
      const workspacePath = (req.body?.workspacePath ?? '').trim();
      const branch = (req.body?.branch ?? '').trim();
      if (!workspacePath || !branch) {
        reply.code(400);
        return { error: 'workspacePath and branch are required' };
      }
      try {
        return await this.service.switchBranch(workspacePath, branch);
      } catch (e) {
        reply.code(500);
        return { error: e instanceof Error ? e.message : String(e) };
      }
    });

    fastify.post('/api/worktree/update', async (req: FastifyRequest<{ Body: UpdateBody }>, reply: FastifyReply) => {
      const workspacePath = (req.body?.workspacePath ?? '').trim();
      const branch = (req.body?.branch ?? '').trim();
      if (!workspacePath || !branch) {
        reply.code(400);
        return { error: 'workspacePath and branch are required' };
      }
      try {
        return await this.service.updateBranch(workspacePath, branch);
      } catch (e) {
        reply.code(500);
        return { error: e instanceof Error ? e.message : String(e) };
      }
    });

    fastify.delete('/api/worktree/remove', async (req: FastifyRequest<{ Querystring: RemoveQs }>, reply: FastifyReply) => {
      const workspacePath = (req.query?.workspacePath ?? '').trim();
      const branch = (req.query?.branch ?? '').trim();
      if (!workspacePath || !branch) {
        reply.code(400);
        return { error: 'workspacePath and branch are required' };
      }
      try {
        await this.service.removeBranch(workspacePath, branch);
        return { success: true };
      } catch (e) {
        reply.code(500);
        return { error: e instanceof Error ? e.message : String(e) };
      }
    });
  }
}
