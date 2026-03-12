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
      working_directory TEXT,
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

    CREATE TABLE IF NOT EXISTS mcp_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      command TEXT NOT NULL,
      args TEXT,
      env TEXT,
      enabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      allowed_tools TEXT,
      content TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_executions_workflow_id ON executions(workflow_id);
    CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
    CREATE INDEX IF NOT EXISTS idx_step_executions_execution_id ON step_executions(execution_id);
    CREATE INDEX IF NOT EXISTS idx_mcp_servers_enabled ON mcp_servers(enabled);
    CREATE INDEX IF NOT EXISTS idx_skills_enabled ON skills(enabled);
  `);

  runMigrations(database);

  log.info('Database tables initialized');
}

/**
 * 运行数据库迁移
 *
 * @param database 数据库实例
 */
function runMigrations(database: Database.Database): void {
  const columns = database.prepare("PRAGMA table_info(workflows)").all() as { name: string }[];
  const columnNames = columns.map(col => col.name);

  if (!columnNames.includes('working_directory')) {
    database.exec('ALTER TABLE workflows ADD COLUMN working_directory TEXT');
    log.info('Migration: added working_directory column to workflows table');
  }

  const stepColumns = database.prepare("PRAGMA table_info(step_executions)").all() as { name: string }[];
  const stepColumnNames = stepColumns.map(col => col.name);

  if (!stepColumnNames.includes('validation_status')) {
    database.exec('ALTER TABLE step_executions ADD COLUMN validation_status TEXT');
    log.info('Migration: added validation_status column to step_executions table');
  }
  if (!stepColumnNames.includes('validation_output')) {
    database.exec('ALTER TABLE step_executions ADD COLUMN validation_output TEXT');
    log.info('Migration: added validation_output column to step_executions table');
  }
  if (!stepColumnNames.includes('events_json')) {
    database.exec('ALTER TABLE step_executions ADD COLUMN events_json TEXT');
    log.info('Migration: added events_json column to step_executions table');
  }
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
