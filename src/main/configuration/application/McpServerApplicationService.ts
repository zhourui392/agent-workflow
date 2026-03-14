/**
 * MCP 服务应用服务
 */

import type { McpServer, CreateMcpServerInput, UpdateMcpServerInput, McpServerConfig } from '../domain/model';
import type { McpServerRepository } from '../domain/repository/McpServerRepository';
import type { CliConfigLoader } from '../infrastructure/CliConfigLoader';

/**
 * CLI MCP 配置项（用于前端显示）
 */
interface CliMcpServer {
  id: string;
  name: string;
  description: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;
  source: 'cli';
  createdAt: string;
  updatedAt: string;
}

export class McpServerApplicationService {
  constructor(
    private readonly repo: McpServerRepository,
    private readonly cliConfigLoader: CliConfigLoader
  ) {}

  list(): McpServer[] {
    return this.repo.findAll();
  }

  listAll(): (McpServer | CliMcpServer)[] {
    const dbServers = this.repo.findAll();
    const cliServers = this.cliConfigLoader.loadClaudeCliMcpServers();

    const result: (McpServer | CliMcpServer)[] = [...dbServers];
    const dbNames = new Set(dbServers.map(s => s.name));
    const now = new Date().toISOString();

    for (const [name, config] of Object.entries(cliServers)) {
      if (!dbNames.has(name)) {
        result.push({
          id: `cli:${name}`,
          name,
          description: 'Claude Code CLI 全局配置',
          command: config.command,
          args: config.args,
          env: config.env,
          enabled: true,
          source: 'cli',
          createdAt: now,
          updatedAt: now
        });
      }
    }

    return result;
  }

  get(id: string): McpServer | null {
    return this.repo.findById(id);
  }

  create(data: CreateMcpServerInput): McpServer {
    return this.repo.create(data);
  }

  update(id: string, data: UpdateMcpServerInput): McpServer | null {
    return this.repo.update(id, data);
  }

  setEnabled(id: string, enabled: boolean): McpServer | null {
    return this.repo.setEnabled(id, enabled);
  }

  remove(id: string): boolean {
    return this.repo.remove(id);
  }
}
