/**
 * Chat REST + SSE 路由
 *
 * 路径设计与 agent-web 对齐：
 * - POST   /api/chat/sessions                    创建会话
 * - GET    /api/chat/sessions                    列出会话摘要
 * - GET    /api/chat/sessions/:id                获取会话详情（含消息列表）
 * - DELETE /api/chat/sessions/:id                删除会话
 * - GET    /api/chat/sessions/:id/stream         SSE 流式发送消息（query: message, env?）
 * - POST   /api/chat/sessions/:id/stop           终止正在运行的执行
 * - GET    /api/chat/sessions/:id/status         查询运行状态
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { validateInput } from '../../shared/interface';
import { isAgentType, type AgentType } from '../domain/model/AgentType';
import type { ChatSession } from '../domain/model/ChatSession';
import type { ChatApplicationService } from '../application/ChatApplicationService';
import type { ChatConfig } from '../infrastructure/ChatConfig';

const StartSessionSchema = z.object({
  agentType: z.string().refine(isAgentType, { message: 'agentType must be claude or codex' }).optional(),
  workingDir: z.string().optional()
});

function sessionToDTO(session: ChatSession): Record<string, unknown> {
  return {
    id: session.id,
    agentType: session.agentType,
    workingDir: session.workingDir,
    createdAt: session.createdAt.toISOString(),
    resumeId: session.resumeId ?? null,
    title: session.title ?? null,
    messages: session.messages.map(m => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp.toISOString()
    }))
  };
}

function writeSseEvent(reply: FastifyReply, event: string, data: string): void {
  // SSE data 字段按行分割以支持多行内容
  const lines = data.split('\n').map(l => `data: ${l}`).join('\n');
  reply.raw.write(`event: ${event}\n${lines}\n\n`);
}

export class ChatRoutes {
  constructor(
    private readonly service: ChatApplicationService,
    private readonly config: ChatConfig
  ) {}

  register(fastify: FastifyInstance): void {
    fastify.post('/api/chat/sessions', async (req: FastifyRequest) => {
      const data = validateInput(StartSessionSchema, req.body ?? {});
      const agentType: AgentType = (data.agentType as AgentType | undefined) ?? 'claude';
      const workingDir = data.workingDir?.trim() || this.config.defaultWorkingDir;
      const session = this.service.startSession(agentType, workingDir);
      return sessionToDTO(session);
    });

    fastify.get('/api/chat/sessions', async (req: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>) => {
      const { limit, offset } = req.query || {};
      return this.service.listSessions(
        limit !== undefined ? Number(limit) : undefined,
        offset !== undefined ? Number(offset) : undefined
      ).map(s => ({
        id: s.id,
        agentType: s.agentType,
        workingDir: s.workingDir,
        createdAt: s.createdAt.toISOString(),
        title: s.title ?? null,
        messageCount: s.messageCount
      }));
    });

    fastify.get('/api/chat/sessions/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const session = this.service.getSession(req.params.id);
      if (!session) {
        reply.code(404);
        return { error: 'Session not found' };
      }
      return sessionToDTO(session);
    });

    fastify.delete('/api/chat/sessions/:id', async (req: FastifyRequest<{ Params: { id: string } }>) => {
      return { success: this.service.deleteSession(req.params.id) };
    });

    fastify.post('/api/chat/sessions/:id/stop', async (req: FastifyRequest<{ Params: { id: string } }>) => {
      return { success: this.service.stopSession(req.params.id) };
    });

    fastify.post('/api/chat/sessions/:id/clear-context', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const ok = this.service.clearContext(req.params.id);
      if (!ok) { reply.code(404); return { error: 'Session not found' }; }
      return { success: true };
    });

    fastify.put('/api/chat/sessions/:id/working-dir', async (req: FastifyRequest<{ Params: { id: string }; Body: { workingDir?: string } }>, reply: FastifyReply) => {
      const workingDir = (req.body?.workingDir ?? '').trim();
      if (!workingDir) { reply.code(400); return { error: 'workingDir required' }; }
      const ok = this.service.updateWorkingDir(req.params.id, workingDir);
      if (!ok) { reply.code(404); return { error: 'Session not found' }; }
      return { success: true };
    });

    fastify.get('/api/chat/sessions/:id/status', async (req: FastifyRequest<{ Params: { id: string } }>) => {
      return { running: this.service.isRunning(req.params.id) };
    });

    // 生成/获取分享 token（幂等）
    fastify.post(
      '/api/chat/sessions/:id/share',
      async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const token = this.service.shareSession(req.params.id);
        if (!token) {
          reply.code(404);
          return { error: 'Session not found' };
        }
        return { shareToken: token };
      }
    );

    // 公开只读快照（无需鉴权）
    fastify.get(
      '/api/share/:token',
      async (req: FastifyRequest<{ Params: { token: string } }>, reply: FastifyReply) => {
        const session = this.service.getSharedSession(req.params.token);
        if (!session) {
          reply.code(404);
          return { error: 'Shared session not found' };
        }
        return {
          title: session.title ?? null,
          agentType: session.agentType,
          workingDir: session.workingDir,
          createdAt: session.createdAt.toISOString(),
          messages: session.messages.map(m => ({
            role: m.role,
            content: m.content,
            timestamp: m.timestamp.toISOString()
          }))
        };
      }
    );

    // SSE 流式发送消息
    fastify.get(
      '/api/chat/sessions/:id/stream',
      async (req: FastifyRequest<{ Params: { id: string }; Querystring: { message?: string; env?: string } }>, reply: FastifyReply) => {
        const message = req.query.message ?? '';
        const env = req.query.env;

        if (message.trim() === '') {
          reply.code(400);
          return { error: 'message query param is required' };
        }

        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no'
        });

        const done = new Promise<void>((resolve) => {
          this.service.streamMessage(req.params.id, message, env, {
            onChunk: (chunk: string) => { writeSseEvent(reply, 'chunk', chunk); },
            onExit: (code: number) => {
              writeSseEvent(reply, 'exit', String(code));
              reply.raw.end();
              resolve();
            },
            onError: (err: Error) => {
              writeSseEvent(reply, 'error', err.message);
            }
          });

          // 客户端断开时停止执行
          req.raw.on('close', () => {
            this.service.stopSession(req.params.id);
          });
        });

        await done;
        return reply;
      }
    );
  }
}
