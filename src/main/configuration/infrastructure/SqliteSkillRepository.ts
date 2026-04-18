/**
 * Skill SQLite 仓库实现
 *
 * 组合关系：
 * - SqliteSkillRepository 负责 DB 元数据（id/name/enabled/dir_path/时间戳）
 * - SkillFileStore 负责 global_config/skills/{name}/ 目录的落盘 CRUD
 * - SkillDraftParser 负责从 SKILL.md 懒加载 description/allowedTools 注入实体
 */

import { v4 as uuidv4 } from 'uuid';
import type Database from 'better-sqlite3';
import log from '../../shared/infrastructure/logger';
import { Skill } from '../domain/model';
import type { CreateSkillInput, UpdateSkillInput } from '../domain/model';
import type { SkillRepository } from '../domain/repository/SkillRepository';
import { SkillFileStore } from './SkillFileStore';
import { parseSkillMd, SkillDraftParseError } from '../domain/service/SkillDraftParser';

interface SkillRow {
  id: string;
  name: string;
  dir_path: string;
  enabled: number | boolean;
  created_at: string;
  updated_at: string;
}

export class SqliteSkillRepository implements SkillRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly fileStore: SkillFileStore
  ) {}

  private rowToSkill(row: SkillRow): Skill {
    const name = row.name;
    const dirPath = this.fileStore.getSkillDir(name);

    let description: string | undefined;
    let allowedTools: string[] | undefined;
    const md = this.fileStore.readSkillMd(name);
    if (md) {
      try {
        const meta = parseSkillMd(md);
        description = meta.description;
        allowedTools = meta.allowedTools;
      } catch (error) {
        if (error instanceof SkillDraftParseError) {
          log.warn('Skill SKILL.md frontmatter 解析失败', { name, error: error.message });
        } else {
          throw error;
        }
      }
    }

    return new Skill({
      id: row.id,
      name,
      dirPath,
      description,
      allowedTools,
      enabled: Boolean(row.enabled),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  }

  findAll(): Skill[] {
    const rows = this.db.prepare('SELECT * FROM skills ORDER BY created_at DESC').all() as SkillRow[];
    return rows.map(row => this.rowToSkill(row));
  }

  findById(id: string): Skill | null {
    const row = this.db.prepare('SELECT * FROM skills WHERE id = ?').get(id) as SkillRow | undefined;
    return row ? this.rowToSkill(row) : null;
  }

  findByIds(ids: string[]): Skill[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(', ');
    const rows = this.db
      .prepare(`SELECT * FROM skills WHERE id IN (${placeholders})`)
      .all(...ids) as SkillRow[];
    return rows.map(row => this.rowToSkill(row));
  }

  findEnabled(): Skill[] {
    const rows = this.db.prepare('SELECT * FROM skills WHERE enabled = 1').all() as SkillRow[];
    return rows.map(row => this.rowToSkill(row));
  }

  findByName(name: string): Skill | null {
    const row = this.db.prepare('SELECT * FROM skills WHERE name = ?').get(name) as SkillRow | undefined;
    return row ? this.rowToSkill(row) : null;
  }

  /**
   * 创建 Skill：先复制 sourceDir 到 global_config/skills/{name}/，再插入 DB 行。
   * 任一环节失败则回滚：若文件已写入，清理目录；若 DB 失败，确保孤儿目录被删。
   */
  create(data: CreateSkillInput): Skill {
    const id = uuidv4();
    const now = new Date().toISOString();

    this.fileStore.importFromSourceDir(data.sourceDir, data.name);

    try {
      this.db.prepare(`
        INSERT INTO skills (id, name, dir_path, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        id,
        data.name,
        data.name,
        data.enabled ? 1 : 0,
        now,
        now
      );
    } catch (error) {
      this.fileStore.remove(data.name);
      throw error;
    }

    return this.findById(id)!;
  }

  update(id: string, data: UpdateSkillInput): Skill | null {
    if (!this.findById(id)) return null;

    const now = new Date().toISOString();
    const fields: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (data.enabled !== undefined) {
      fields.push('enabled = ?');
      values.push(data.enabled ? 1 : 0);
    }

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
    const existing = this.findById(id);
    if (!existing) return false;

    const result = this.db.prepare('DELETE FROM skills WHERE id = ?').run(id);
    if (result.changes > 0) {
      this.fileStore.remove(existing.name);
      return true;
    }
    return false;
  }
}
