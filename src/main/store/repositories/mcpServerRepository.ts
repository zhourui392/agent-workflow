/**
 * MCP 服务配置数据访问层
 *
 * @author zhourui(V33215020)
 * @since 2026/03/12
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database';
import type {
  McpServer,
  CreateMcpServerInput,
  UpdateMcpServerInput
} from '../models';

/**
 * 数据库行转换为 McpServer 对象
 *
 * @param row 数据库行数据
 * @returns McpServer 对象
 */
function rowToMcpServer(row: Record<string, unknown>): McpServer {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string | undefined,
    command: row.command as string,
    args: row.args ? JSON.parse(row.args as string) : undefined,
    env: row.env ? JSON.parse(row.env as string) : undefined,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  };
}

/**
 * 获取所有 MCP 服务列表
 *
 * @returns MCP 服务列表
 */
export function findAll(): McpServer[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM mcp_servers ORDER BY created_at DESC').all();
  return rows.map(row => rowToMcpServer(row as Record<string, unknown>));
}

/**
 * 根据 ID 查找 MCP 服务
 *
 * @param id MCP 服务 ID
 * @returns MCP 服务对象，不存在则返回 null
 */
export function findById(id: string): McpServer | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id);
  return row ? rowToMcpServer(row as Record<string, unknown>) : null;
}

/**
 * 根据 ID 列表查找 MCP 服务
 *
 * @param ids MCP 服务 ID 列表
 * @returns MCP 服务列表
 */
export function findByIds(ids: string[]): McpServer[] {
  if (ids.length === 0) {
    return [];
  }

  const db = getDatabase();
  const placeholders = ids.map(() => '?').join(', ');
  const rows = db
    .prepare(`SELECT * FROM mcp_servers WHERE id IN (${placeholders})`)
    .all(...ids);
  return rows.map(row => rowToMcpServer(row as Record<string, unknown>));
}

/**
 * 查找所有全局启用的 MCP 服务
 *
 * @returns 启用的 MCP 服务列表
 */
export function findEnabled(): McpServer[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM mcp_servers WHERE enabled = 1').all();
  return rows.map(row => rowToMcpServer(row as Record<string, unknown>));
}

/**
 * 根据名称查找 MCP 服务
 *
 * @param name MCP 服务名称
 * @returns MCP 服务对象，不存在则返回 null
 */
export function findByName(name: string): McpServer | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM mcp_servers WHERE name = ?').get(name);
  return row ? rowToMcpServer(row as Record<string, unknown>) : null;
}

/**
 * 创建新 MCP 服务
 *
 * @param data 创建请求数据
 * @returns 创建的 MCP 服务对象
 */
export function create(data: CreateMcpServerInput): McpServer {
  const db = getDatabase();
  const id = uuidv4();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO mcp_servers (
      id, name, description, command, args, env, enabled, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    data.name,
    data.description || null,
    data.command,
    data.args ? JSON.stringify(data.args) : null,
    data.env ? JSON.stringify(data.env) : null,
    data.enabled ? 1 : 0,
    now,
    now
  );

  return findById(id)!;
}

/**
 * 更新 MCP 服务
 *
 * @param id MCP 服务 ID
 * @param data 更新请求数据
 * @returns 更新后的 MCP 服务对象，不存在则返回 null
 */
export function update(id: string, data: UpdateMcpServerInput): McpServer | null {
  const existing = findById(id);
  if (!existing) {
    return null;
  }

  const db = getDatabase();
  const now = new Date().toISOString();

  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [now];

  if (data.name !== undefined) {
    fields.push('name = ?');
    values.push(data.name);
  }
  if (data.description !== undefined) {
    fields.push('description = ?');
    values.push(data.description || null);
  }
  if (data.command !== undefined) {
    fields.push('command = ?');
    values.push(data.command);
  }
  if (data.args !== undefined) {
    fields.push('args = ?');
    values.push(data.args ? JSON.stringify(data.args) : null);
  }
  if (data.env !== undefined) {
    fields.push('env = ?');
    values.push(data.env ? JSON.stringify(data.env) : null);
  }
  if (data.enabled !== undefined) {
    fields.push('enabled = ?');
    values.push(data.enabled ? 1 : 0);
  }

  values.push(id);

  const stmt = db.prepare(`UPDATE mcp_servers SET ${fields.join(', ')} WHERE id = ?`);
  stmt.run(...values);

  return findById(id);
}

/**
 * 设置 MCP 服务启用状态
 *
 * @param id MCP 服务 ID
 * @param enabled 是否启用
 * @returns 更新后的 MCP 服务对象，不存在则返回 null
 */
export function setEnabled(id: string, enabled: boolean): McpServer | null {
  const existing = findById(id);
  if (!existing) {
    return null;
  }

  const db = getDatabase();
  const now = new Date().toISOString();

  const stmt = db.prepare('UPDATE mcp_servers SET enabled = ?, updated_at = ? WHERE id = ?');
  stmt.run(enabled ? 1 : 0, now, id);

  return findById(id);
}

/**
 * 删除 MCP 服务
 *
 * @param id MCP 服务 ID
 * @returns 是否删除成功
 */
export function remove(id: string): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id);
  return result.changes > 0;
}
