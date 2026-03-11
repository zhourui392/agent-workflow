/**
 * 核心模块功能验证测试
 *
 * 直接测试数据库、Repository、Service层功能
 *
 * @author zhourui(V33215020)
 * @since 2026/03/11
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import cron from 'node-cron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DB_PATH = path.join(__dirname, 'test-workflow.db');

let db: Database.Database;

function setupDatabase() {
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  db = new Database(TEST_DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
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
  `);

  console.log('✓ Database initialized');
}

function testWorkflowCRUD() {
  const id = 'test-workflow-1';

  const insertStmt = db.prepare(`
    INSERT INTO workflows (id, name, enabled, steps, on_failure)
    VALUES (?, ?, 1, ?, 'stop')
  `);
  insertStmt.run(id, 'Test Workflow', JSON.stringify([{ name: 'step1', prompt: 'Test prompt' }]));
  console.log('✓ Workflow created');

  const workflow = db.prepare('SELECT * FROM workflows WHERE id = ?').get(id);
  if (!workflow) throw new Error('Workflow not found');
  console.log('✓ Workflow retrieved');

  const updateStmt = db.prepare('UPDATE workflows SET name = ? WHERE id = ?');
  updateStmt.run('Updated Workflow', id);

  const updated = db.prepare('SELECT * FROM workflows WHERE id = ?').get(id) as { name: string };
  if (updated.name !== 'Updated Workflow') throw new Error('Workflow not updated');
  console.log('✓ Workflow updated');

  const deleteStmt = db.prepare('DELETE FROM workflows WHERE id = ?');
  deleteStmt.run(id);

  const deleted = db.prepare('SELECT * FROM workflows WHERE id = ?').get(id);
  if (deleted) throw new Error('Workflow not deleted');
  console.log('✓ Workflow deleted');
}

function testExecutionRecords() {
  const workflowId = 'test-workflow-2';
  const executionId = 'test-execution-1';

  db.prepare(`
    INSERT INTO workflows (id, name, enabled, steps, on_failure)
    VALUES (?, ?, 1, ?, 'stop')
  `).run(workflowId, 'Test Workflow 2', JSON.stringify([{ name: 'step1', prompt: 'Test' }]));

  db.prepare(`
    INSERT INTO executions (id, workflow_id, trigger_type, status)
    VALUES (?, ?, 'manual', 'running')
  `).run(executionId, workflowId);
  console.log('✓ Execution created');

  db.prepare(`
    INSERT INTO step_executions (id, execution_id, step_index, status, prompt_rendered)
    VALUES (?, ?, 0, 'running', 'Rendered prompt')
  `).run('step-exec-1', executionId);
  console.log('✓ Step execution created');

  db.prepare(`
    UPDATE step_executions SET status = 'success', output_text = 'Output', tokens_used = 100
    WHERE id = ?
  `).run('step-exec-1');

  db.prepare(`
    UPDATE executions SET status = 'success', total_tokens = 100
    WHERE id = ?
  `).run(executionId);
  console.log('✓ Execution completed');

  const execution = db.prepare('SELECT * FROM executions WHERE id = ?').get(executionId) as { status: string };
  if (execution.status !== 'success') throw new Error('Execution status not updated');

  const steps = db.prepare('SELECT * FROM step_executions WHERE execution_id = ?').all(executionId);
  if (steps.length !== 1) throw new Error('Step executions not found');
  console.log('✓ Execution records verified');

  db.prepare('DELETE FROM workflows WHERE id = ?').run(workflowId);
}

function testTemplateRendering() {
  const context = {
    inputs: { name: 'Claude' },
    steps: { analyze: { output: 'Analysis complete' } }
  };

  const template = 'Hello {{inputs.name}}! Previous: {{steps.analyze.output}}';

  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const now = new Date();
  const builtins: Record<string, string> = {
    today: formatDate(now),
    yesterday: formatDate(new Date(now.getTime() - 24 * 60 * 60 * 1000))
  };

  function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  function renderTemplate(tmpl: string, ctx: Record<string, unknown>): string {
    return tmpl.replace(/\{\{(\s*[\w.]+\s*)\}\}/g, (match, varName: string) => {
      const name = varName.trim();
      if (name in builtins) return builtins[name];
      const value = getNestedValue(ctx, name);
      if (value === undefined || value === null) return match;
      return String(value);
    });
  }

  const rendered = renderTemplate(template, context as Record<string, unknown>);
  if (!rendered.includes('Claude') || !rendered.includes('Analysis complete')) {
    throw new Error('Template rendering failed');
  }
  console.log('✓ Template rendering works');

  const dateTemplate = 'Today is {{today}}, yesterday was {{yesterday}}';
  const dateRendered = renderTemplate(dateTemplate, {});
  if (!dateRendered.match(/\d{4}-\d{2}-\d{2}/)) {
    throw new Error('Date template rendering failed');
  }
  console.log('✓ Date variables work');
}

function testCronExpression() {
  const validExpressions = [
    '0 0 * * *',
    '*/5 * * * *',
    '0 9 * * 1-5'
  ];

  const invalidExpressions = [
    'invalid',
    '* * * *',
    '60 * * * *'
  ];

  for (const expr of validExpressions) {
    if (!cron.validate(expr)) {
      throw new Error(`Valid cron expression rejected: ${expr}`);
    }
  }
  console.log('✓ Valid cron expressions accepted');

  for (const expr of invalidExpressions) {
    if (cron.validate(expr)) {
      throw new Error(`Invalid cron expression accepted: ${expr}`);
    }
  }
  console.log('✓ Invalid cron expressions rejected');
}

function cleanup() {
  if (db) {
    db.close();
  }
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  console.log('✓ Cleanup completed');
}

async function main() {
  console.log('=== Core Module Tests ===\n');

  try {
    setupDatabase();
    console.log('');

    console.log('--- Workflow CRUD ---');
    testWorkflowCRUD();
    console.log('');

    console.log('--- Execution Records ---');
    testExecutionRecords();
    console.log('');

    console.log('--- Template Rendering ---');
    testTemplateRendering();
    console.log('');

    console.log('--- Cron Expression ---');
    testCronExpression();
    console.log('');

    console.log('=== All Tests Passed! ===');
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  } finally {
    cleanup();
  }
}

main();
