/**
 * 测试数据库辅助工具
 *
 * 提供内存 SQLite 数据库，用于 Repository 集成测试。
 */
import Database from 'better-sqlite3';
import { initializeTables, runMigrations } from '../../src/main/shared/infrastructure/schema';

/**
 * 创建内存测试数据库（已初始化表结构）
 */
export function createTestDatabase(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initializeTables(db);
  runMigrations(db);
  return db;
}
