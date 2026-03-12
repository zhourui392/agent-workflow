/**
 * Skill 配置数据访问层
 *
 * @author zhourui(V33215020)
 * @since 2026/03/12
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database';
import type {
  Skill,
  CreateSkillInput,
  UpdateSkillInput
} from '../models';

/**
 * 数据库行转换为 Skill 对象
 *
 * @param row 数据库行数据
 * @returns Skill 对象
 */
function rowToSkill(row: Record<string, unknown>): Skill {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string | undefined,
    allowedTools: row.allowed_tools ? JSON.parse(row.allowed_tools as string) : undefined,
    content: row.content as string,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  };
}

/**
 * 获取所有 Skill 列表
 *
 * @returns Skill 列表
 */
export function findAll(): Skill[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM skills ORDER BY created_at DESC').all();
  return rows.map(row => rowToSkill(row as Record<string, unknown>));
}

/**
 * 根据 ID 查找 Skill
 *
 * @param id Skill ID
 * @returns Skill 对象，不存在则返回 null
 */
export function findById(id: string): Skill | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM skills WHERE id = ?').get(id);
  return row ? rowToSkill(row as Record<string, unknown>) : null;
}

/**
 * 根据 ID 列表查找 Skill
 *
 * @param ids Skill ID 列表
 * @returns Skill 列表
 */
export function findByIds(ids: string[]): Skill[] {
  if (ids.length === 0) {
    return [];
  }

  const db = getDatabase();
  const placeholders = ids.map(() => '?').join(', ');
  const rows = db
    .prepare(`SELECT * FROM skills WHERE id IN (${placeholders})`)
    .all(...ids);
  return rows.map(row => rowToSkill(row as Record<string, unknown>));
}

/**
 * 查找所有全局启用的 Skill
 *
 * @returns 启用的 Skill 列表
 */
export function findEnabled(): Skill[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM skills WHERE enabled = 1').all();
  return rows.map(row => rowToSkill(row as Record<string, unknown>));
}

/**
 * 根据名称查找 Skill
 *
 * @param name Skill 名称
 * @returns Skill 对象，不存在则返回 null
 */
export function findByName(name: string): Skill | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM skills WHERE name = ?').get(name);
  return row ? rowToSkill(row as Record<string, unknown>) : null;
}

/**
 * 创建新 Skill
 *
 * @param data 创建请求数据
 * @returns 创建的 Skill 对象
 */
export function create(data: CreateSkillInput): Skill {
  const db = getDatabase();
  const id = uuidv4();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO skills (
      id, name, description, allowed_tools, content, enabled, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    data.name,
    data.description || null,
    data.allowedTools ? JSON.stringify(data.allowedTools) : null,
    data.content,
    data.enabled ? 1 : 0,
    now,
    now
  );

  return findById(id)!;
}

/**
 * 更新 Skill
 *
 * @param id Skill ID
 * @param data 更新请求数据
 * @returns 更新后的 Skill 对象，不存在则返回 null
 */
export function update(id: string, data: UpdateSkillInput): Skill | null {
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
  if (data.allowedTools !== undefined) {
    fields.push('allowed_tools = ?');
    values.push(data.allowedTools ? JSON.stringify(data.allowedTools) : null);
  }
  if (data.content !== undefined) {
    fields.push('content = ?');
    values.push(data.content);
  }
  if (data.enabled !== undefined) {
    fields.push('enabled = ?');
    values.push(data.enabled ? 1 : 0);
  }

  values.push(id);

  const stmt = db.prepare(`UPDATE skills SET ${fields.join(', ')} WHERE id = ?`);
  stmt.run(...values);

  return findById(id);
}

/**
 * 设置 Skill 启用状态
 *
 * @param id Skill ID
 * @param enabled 是否启用
 * @returns 更新后的 Skill 对象，不存在则返回 null
 */
export function setEnabled(id: string, enabled: boolean): Skill | null {
  const existing = findById(id);
  if (!existing) {
    return null;
  }

  const db = getDatabase();
  const now = new Date().toISOString();

  const stmt = db.prepare('UPDATE skills SET enabled = ?, updated_at = ? WHERE id = ?');
  stmt.run(enabled ? 1 : 0, now, id);

  return findById(id);
}

/**
 * 删除 Skill
 *
 * @param id Skill ID
 * @returns 是否删除成功
 */
export function remove(id: string): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM skills WHERE id = ?').run(id);
  return result.changes > 0;
}
