/**
 * 数据库连接与初始化
 *
 * @author zhourui(V33215020)
 * @since 2026/03/11
 */

import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import log from 'electron-log';
import { initializeTables, runMigrations } from './schema';

let db: Database.Database | null = null;

/**
 * 获取数据库文件路径
 */
function getDatabasePath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'agent_workflow.db');
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
