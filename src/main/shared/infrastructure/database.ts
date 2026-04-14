/**
 * 数据库连接与初始化
 *
 * @author zhourui(V33215020)
 * @since 2026/03/11
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import path from 'path';
import log from './logger';
import { initializeTables, runMigrations } from './schema';

let db: Database.Database | null = null;

/**
 * 获取数据库文件路径
 *
 * 优先使用 DB_PATH 环境变量；否则落在 <cwd>/data/agent_workflow.db。
 * 自动创建父目录。
 */
function getDatabasePath(): string {
  const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'agent_workflow.db');
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dbPath;
}

/**
 * 获取数据库实例
 */
export function getDatabase(): Database.Database {
  if (!db) {
    const dbPath = getDatabasePath();
    log.info(`Opening database at: ${dbPath}`);

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    initializeTables(db);
    runMigrations(db);
    log.info('Database tables initialized');
  }

  return db;
}

/**
 * 关闭数据库连接
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    log.info('Database connection closed');
  }
}
