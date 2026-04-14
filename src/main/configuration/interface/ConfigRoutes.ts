/**
 * 全局配置 REST 路由
 *
 * 替代原 ConfigIpcHandler。
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { UpdateConfigSchema, validateInput } from '../../shared/interface';
import type { GlobalConfigApplicationService } from '../application/GlobalConfigApplicationService';

export class ConfigRoutes {
  constructor(private readonly service: GlobalConfigApplicationService) {}

  register(fastify: FastifyInstance): void {
    fastify.get('/api/config', async () => {
      return this.service.getConfig();
    });

    fastify.put('/api/config', async (req: FastifyRequest) => {
      const data = validateInput(UpdateConfigSchema, req.body);
      this.service.updateConfig(data);
      return { success: true };
    });
  }
}
