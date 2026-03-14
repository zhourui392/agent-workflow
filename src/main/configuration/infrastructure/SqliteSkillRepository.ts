/**
 * Skill SQLite 仓库实现
 */

import { v4 as uuidv4 } from 'uuid';
import type Database from 'better-sqlite3';
import { Skill } from '../domain/model';
import type { CreateSkillInput, UpdateSkillInput } from '../domain/model';
import type { SkillRepository } from '../domain/repository/SkillRepository';

function rowToSkill(row: Record<string, unknown>): Skill {
  return new Skill({
    id: row.id as string,
    name: row.name as string,
    description: row.description as string | undefined,
    allowedTools: row.allowed_tools ? JSON.parse(row.allowed_tools as string) : undefined,
    content: row.content as string,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  });
}

export class SqliteSkillRepository implements SkillRepository {
  constructor(private readonly db: Database.Database) {}

  findAll(): Skill[] {
    const rows = this.db.prepare('SELECT * FROM skills ORDER BY created_at DESC').all();
    return rows.map(row => rowToSkill(row as Record<string, unknown>));
  }

  findById(id: string): Skill | null {
    const row = this.db.prepare('SELECT * FROM skills WHERE id = ?').get(id);
    return row ? rowToSkill(row as Record<string, unknown>) : null;
  }

  findByIds(ids: string[]): Skill[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(', ');
    const rows = this.db
      .prepare(`SELECT * FROM skills WHERE id IN (${placeholders})`)
      .all(...ids);
    return rows.map(row => rowToSkill(row as Record<string, unknown>));
  }

  findEnabled(): Skill[] {
    const rows = this.db.prepare('SELECT * FROM skills WHERE enabled = 1').all();
    return rows.map(row => rowToSkill(row as Record<string, unknown>));
  }

  findByName(name: string): Skill | null {
    const row = this.db.prepare('SELECT * FROM skills WHERE name = ?').get(name);
    return row ? rowToSkill(row as Record<string, unknown>) : null;
  }

  create(data: CreateSkillInput): Skill {
    const id = uuidv4();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO skills (
        id, name, description, allowed_tools, content, enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.name,
      data.description || null,
      data.allowedTools ? JSON.stringify(data.allowedTools) : null,
      data.content,
      data.enabled ? 1 : 0,
      now,
      now
    );

    return this.findById(id)!;
  }

  update(id: string, data: UpdateSkillInput): Skill | null {
    if (!this.findById(id)) return null;

    const now = new Date().toISOString();
    const fields: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description || null); }
    if (data.allowedTools !== undefined) { fields.push('allowed_tools = ?'); values.push(data.allowedTools ? JSON.stringify(data.allowedTools) : null); }
    if (data.content !== undefined) { fields.push('content = ?'); values.push(data.content); }
    if (data.enabled !== undefined) { fields.push('enabled = ?'); values.push(data.enabled ? 1 : 0); }

    values.push(id);
    this.db.prepare(`UPDATE skills SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    return this.findById(id);
  }

  setEnabled(id: string, enabled: boolean): Skill | null {
    if (!this.findById(id)) return null;

    const now = new Date().toISOString();
    this.db.prepare('UPDATE skills SET enabled = ?, updated_at = ? WHERE id = ?')
      .run(enabled ? 1 : 0, now, id);

    return this.findById(id);
  }

  remove(id: string): boolean {
    const result = this.db.prepare('DELETE FROM skills WHERE id = ?').run(id);
    return result.changes > 0;
  }
}
