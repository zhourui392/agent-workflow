/**
 * Web 服务器入口
 *
 * 替代原 Electron 入口（src/main/index.ts）。职责：
 * 1. 创建 Fastify 实例
 * 2. 注册 CORS / static / websocket 插件
 * 3. 创建 WebSocket 广播函数并构造 WebSocketProgressNotifier
 * 4. 调用 bootstrap() 组装业务依赖
 * 5. 注册所有 REST 路由 + WS 路由
 * 6. 启动 HTTP 监听 + 优雅退出
 */

// 清除嵌套会话检测，防止从 Claude Code 终端启动时子进程被拒绝
delete process.env.CLAUDECODE;

import path from 'path';
import fs from 'fs';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fstatic from '@fastify/static';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';

import log from './shared/infrastructure/logger';
import { bootstrap, type AppContext } from './bootstrap';
import { WebSocketProgressNotifier } from './execution/infrastructure/WebSocketProgressNotifier';
import { WebSocketSkillGenerationNotifier } from './configuration/infrastructure/WebSocketSkillGenerationNotifier';
import type { ExecutionProgressEvent } from './execution/domain/model/ExecutionResult';
import type { SkillGenerationEvent } from './configuration/domain/service/SkillGenerationNotifier';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

// WebSocket 客户端连接池（任意外部类型，避免硬绑 ws 类型）
const wsClients = new Set<{ send: (data: string) => void; readyState: number }>();

function broadcastRaw(event: unknown): void {
  const payload = JSON.stringify(event);
  for (const client of wsClients) {
    // readyState === 1 => OPEN
    if (client.readyState === 1) {
      try {
        client.send(payload);
      } catch (err) {
        log.warn('WS broadcast to client failed', err);
      }
    }
  }
}

function broadcastExecution(event: ExecutionProgressEvent): void {
  broadcastRaw(event);
}

function broadcastSkillGeneration(event: SkillGenerationEvent): void {
  broadcastRaw(event);
}

async function registerStaticOrDevProxy(fastify: FastifyInstance): Promise<void> {
  const rendererDist = path.join(__dirname, '..', 'renderer');
  if (fs.existsSync(rendererDist)) {
    await fastify.register(fstatic, {
      root: rendererDist,
      prefix: '/'
    });
    fastify.setNotFoundHandler(async (req, reply) => {
      if (req.url.startsWith('/api') || req.url.startsWith('/ws')) {
        reply.code(404);
        return { error: 'Not Found' };
      }
      return reply.sendFile('index.html');
    });
    log.info(`Serving static renderer from: ${rendererDist}`);
  } else {
    log.warn(`Renderer dist not found at ${rendererDist}; run vite build or use dev proxy.`);
  }
}

async function main(): Promise<void> {
  const fastify: FastifyInstance = Fastify({
    logger: false,
    bodyLimit: 20 * 1024 * 1024
  });

  await fastify.register(cors, { origin: true, credentials: true });
  await fastify.register(multipart, { limits: { fileSize: 100 * 1024 * 1024 } });
  await fastify.register(websocket);

  // WS 路由 —— 执行进度广播
  fastify.register(async function wsRoutes(f) {
    f.get('/ws/executions', { websocket: true }, (connection) => {
      const socket = connection as unknown as {
        send: (d: string) => void;
        readyState: number;
        on: (e: string, cb: () => void) => void;
      };
      wsClients.add(socket);
      log.info(`WS client connected. total=${wsClients.size}`);
      socket.on('close', () => {
        wsClients.delete(socket);
        log.info(`WS client disconnected. total=${wsClients.size}`);
      });
      socket.on('error', () => {
        wsClients.delete(socket);
      });
    });
  });

  // 业务装配
  const progressNotifier = new WebSocketProgressNotifier(broadcastExecution);
  const skillGenerationNotifier = new WebSocketSkillGenerationNotifier(broadcastSkillGeneration);
  const appContext: AppContext = bootstrap(progressNotifier, skillGenerationNotifier);
  appContext.registerRoutes(fastify);

  // 健康检查
  fastify.get('/api/health', async () => ({ status: 'ok', timestamp: Date.now() }));

  // 静态文件（生产）
  await registerStaticOrDevProxy(fastify);

  // 启动 cron
  appContext.syncCron();

  try {
    await fastify.listen({ port: PORT, host: HOST });
    log.info(`Server listening on http://${HOST}:${PORT}`);
  } catch (err) {
    log.error('Failed to start server', err);
    process.exit(1);
  }

  const shutdown = async (signal: string): Promise<void> => {
    log.info(`Received ${signal}, shutting down...`);
    try {
      appContext.cleanup();
      await fastify.close();
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', () => { void shutdown('SIGINT'); });
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.on('uncaughtException', (error) => {
    log.error('Uncaught exception:', error);
  });
  process.on('unhandledRejection', (reason) => {
    log.error('Unhandled rejection:', reason);
  });
}

void main();
