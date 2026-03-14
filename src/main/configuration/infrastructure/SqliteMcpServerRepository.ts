/**
 * MCP 服务 SQLite 仓库实现
 */

import { v4 as uuidv4 } from 'uuid';
import type Database from 'better-sqlite3';
import { McpServer } from '../domain/model';
import type { CreateMcpServerInput, UpdateMcpServerInput } from '../domain/model';
import type { McpServerRepository } from '../domain/repository/McpServerRepository';

function rowToMcpServer(row: Record<string, unknown>): McpServer {
  return new McpServer({
    id: row.id as string,
    name: row.name as string,
    description: row.description as string | undefined,
    command: row.command as string,
    args: row.args ? JSON.parse(row.args as string) : undefined,
    env: row.env ? JSON.parse(row.env as string) : undefined,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  });
}

export class SqliteMcpServerRepository implements McpServerRepository {
  constructor(private readonly db: Database.Database) {}

  findAll(): McpServer[] {
    const rows = this.db.prepare('SELECT * FROM mcp_servers ORDER BY created_at DESC').all();
    return rows.map(row => rowToMcpServer(row as Record<string, unknown>));
  }

  findById(id: string): McpServer | null {
    const row = this.db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id);
    return row ? rowToMcpServer(row as Record<string, unknown>) : null;
  }

  findByIds(ids: string[]): McpServer[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(', ');
    const rows = this.db
      .prepare(`SELECT * FROM mcp_servers WHERE id IN (${placeholders})`)
      .all(...ids);
    return rows.map(row => rowToMcpServer(row as Record<string, unknown>));
  }

  findEnabled(): McpServer[] {
    const rows = this.db.prepare('SELECT * FROM mcp_servers WHERE enabled = 1').all();
    return rows.map(row => rowToMcpServer(row as Record<string, unknown>));
  }

  findByName(name: string): McpServer | null {
    const row = this.db.prepare('SELECT * FROM mcp_servers WHERE name = ?').get(name);
    return row ? rowToMcpServer(row as Record<string, unknown>) : null;
  }

  create(data: CreateMcpServerInput): McpServer {
    const id = uuidv4();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO mcp_servers (
        id, name, description, command, args, env, enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
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

    return this.findById(id)!;
  }

  update(id: string, data: UpdateMcpServerInput): McpServer | null {
    if (!this.findById(id)) return null;

    const now = new Date().toISOString();
    const fields: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description || null); }
    if (data.command !== undefined) { fields.push('command = ?'); values.push(data.command); }
    if (data.args !== undefined) { fields.push('args = ?'); values.push(data.args ? JSON.stringify(data.args) : null); }
    if (data.env !== undefined) { fields.push('env = ?'); values.push(data.env ? JSON.stringify(data.env) : null); }
    if (data.enabled !== undefined) { fields.push('enabled = ?'); values.push(data.enabled ? 1 : 0); }

    values.push(id);
    this.db.prepare(`UPDATE mcp_servers SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    return this.findById(id);
  }

  setEnabled(id: string, enabled: boolean): McpServer | null {
    if (!this.findById(id)) return null;

    const now = new Date().toISOString();
    this.db.prepare('UPDATE mcp_servers SET enabled = ?, updated_at = ? WHERE id = ?')
      .run(enabled ? 1 : 0, now, id);

    return this.findById(id);
  }

  remove(id: string): boolean {
    const result = this.db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id);
    return result.changes > 0;
  }
}
