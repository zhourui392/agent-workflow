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

let db: Database.Database | null = null;

/**
 * 获取数据库文件路径
 *
 * @returns 数据库文件绝对路径
 */
function getDatabasePath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'agent_workflow.db');
}

/**
 * 初始化数据库表结构
 *
 * @param database 数据库实例
 */
function initializeTables(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      schedule TEXT,
      inputs TEXT,
      steps TEXT NOT NULL,
      rules TEXT,
      mcp_servers TEXT,
      skills TEXT,
      limits TEXT,
      output TEXT,
      on_failure TEXT DEFAULT 'stop',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS executions (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      started_at TEXT DEFAULT (datetime('now')),
      finished_at TEXT,
      current_step INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      error_message TEXT,
      FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS step_executions (
      id TEXT PRIMARY KEY,
      execution_id TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      prompt_rendered TEXT,
      output_text TEXT,
      tokens_used INTEGER DEFAULT 0,
      model_used TEXT,
      error_message TEXT,
      started_at TEXT DEFAULT (datetime('now')),
      finished_at TEXT,
      FOREIGN KEY (execution_id) REFERENCES executions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_executions_workflow_id ON executions(workflow_id);
    CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
    CREATE INDEX IF NOT EXISTS idx_step_executions_execution_id ON step_executions(execution_id);
  `);

  log.info('Database tables initialized');
}

/**
 * 获取数据库实例
 *
 * @returns 数据库实例
 */
export function getDatabase(): Database.Database {
  if (!db) {
    const dbPath = getDatabasePath();
    log.info(`Opening database at: ${dbPath}`);

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    initializeTables(db);
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
