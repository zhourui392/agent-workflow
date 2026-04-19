/**
 * 全局配置 REST 路由
 *
 * 替代原 ConfigIpcHandler。
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { UpdateConfigSchema, validateInput } from '../../shared/interface';
import type { GlobalConfigApplicationService } from '../application/GlobalConfigApplicationService';
import type { McpToolCatalog } from '../domain/service/McpToolCatalogService';

export class ConfigRoutes {
  constructor(
    private readonly service: GlobalConfigApplicationService,
    private readonly mcpToolCatalog: McpToolCatalog
  ) {}

  register(fastify: FastifyInstance): void {
    fastify.get('/api/config', async () => {
      return this.service.getConfig();
    });

    fastify.put('/api/config', async (req: FastifyRequest) => {
      const data = validateInput(UpdateConfigSchema, req.body);
      this.service.updateConfig(data);
      return { success: true };
    });

    fastify.get('/api/config/mcp/tools', async (req: FastifyRequest<{
      Querystring: { refresh?: string };
    }>) => {
      const force = req.query.refresh === '1' || req.query.refresh === 'true';
      return this.mcpToolCatalog.listAll(force);
    });

    fastify.get('/api/config/mcp/tools/:server', async (req: FastifyRequest<{
      Params: { server: string };
      Querystring: { refresh?: string };
    }>) => {
      const force = req.query.refresh === '1' || req.query.refresh === 'true';
      return this.mcpToolCatalog.listByServer(req.params.server, force);
    });

    fastify.post('/api/config/mcp/tools/refresh', async () => {
      this.mcpToolCatalog.invalidate();
      const tools = await this.mcpToolCatalog.listAll(true);
      return { success: true, tools };
    });
  }
}
