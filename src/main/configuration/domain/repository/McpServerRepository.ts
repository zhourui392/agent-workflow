/**
 * MCP 服务仓库接口
 */
import type { McpServer, CreateMcpServerInput, UpdateMcpServerInput } from '../model';

export interface McpServerRepository {
  findAll(): McpServer[];
  findById(id: string): McpServer | null;
  findByIds(ids: string[]): McpServer[];
  findEnabled(): McpServer[];
  findByName(name: string): McpServer | null;
  create(data: CreateMcpServerInput): McpServer;
  update(id: string, data: UpdateMcpServerInput): McpServer | null;
  setEnabled(id: string, enabled: boolean): McpServer | null;
  remove(id: string): boolean;
}
