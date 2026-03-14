/**
 * 数据库 Schema 定义
 *
 * 纯 DDL 和迁移逻辑，不依赖 Electron，可在测试中使用。
 */
import type Database from 'better-sqlite3';

/**
 * 初始化所有表结构和索引
 */
export function initializeTables(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      schedule TEXT,
      inputs TEXT,
      steps TEXT NOT NULL,
      rules TEXT,
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
    CREATE INDEX IF NOT EXISTS idx_skills_enabled ON skills(enabled);
    CREATE INDEX IF NOT EXISTS idx_workflows_enabled_schedule ON workflows(enabled, schedule);
    CREATE INDEX IF NOT EXISTS idx_step_executions_exec_step ON step_executions(execution_id, step_index);
  `);
}

/**
 * 运行数据库迁移
 */
export function runMigrations(database: Database.Database): void {
  const columns = database.prepare("PRAGMA table_info(workflows)").all() as { name: string }[];
  const columnNames = columns.map(col => col.name);

  if (!columnNames.includes('working_directory')) {
    database.exec('ALTER TABLE workflows ADD COLUMN working_directory TEXT');
  }

  if (!columnNames.includes('retry_config')) {
    database.exec('ALTER TABLE workflows ADD COLUMN retry_config TEXT');
  }

  const stepColumns = database.prepare("PRAGMA table_info(step_executions)").all() as { name: string }[];
  const stepColumnNames = stepColumns.map(col => col.name);

  if (!stepColumnNames.includes('validation_status')) {
    database.exec('ALTER TABLE step_executions ADD COLUMN validation_status TEXT');
  }
  if (!stepColumnNames.includes('validation_output')) {
    database.exec('ALTER TABLE step_executions ADD COLUMN validation_output TEXT');
  }
  if (!stepColumnNames.includes('events_json')) {
    database.exec('ALTER TABLE step_executions ADD COLUMN events_json TEXT');
  }
}
