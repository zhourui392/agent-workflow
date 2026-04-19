/**
 * 工作流 SQLite 仓库实现
 */

import { v4 as uuidv4 } from 'uuid';
import type Database from 'better-sqlite3';
import { Workflow } from '../domain/model';
import type { CreateWorkflowRequest, UpdateWorkflowRequest } from '../domain/model';
import type { WorkflowRepository } from '../domain/repository/WorkflowRepository';
import { safeJsonParse } from '../../shared/infrastructure';
import type { WorkflowStep } from '../domain/model/WorkflowStep';
import type { WorkflowInput } from '../domain/model/WorkflowInput';
import type { WorkflowLimits } from '../domain/model/WorkflowLimits';
import type { WorkflowOutput } from '../domain/model/WorkflowOutput';
import type { RetryConfig } from '../domain/model/Workflow';
function rowToWorkflow(row: Record<string, unknown>): Workflow {
  return new Workflow({
    id: row.id as string,
    name: row.name as string,
    enabled: Boolean(row.enabled),
    schedule: row.schedule as string | undefined,
    inputs: safeJsonParse<WorkflowInput[] | undefined>(row.inputs as string, undefined, 'workflow.inputs'),
    steps: safeJsonParse<WorkflowStep[]>(row.steps as string, [], 'workflow.steps'),
    rules: row.rules as string | undefined,
    skills: safeJsonParse<Record<string, string> | undefined>(row.skills as string, undefined, 'workflow.skills'),
    limits: safeJsonParse<WorkflowLimits | undefined>(row.limits as string, undefined, 'workflow.limits'),
    output: safeJsonParse<WorkflowOutput | undefined>(row.output as string, undefined, 'workflow.output'),
    workingDirectory: row.working_directory as string | undefined,
    onFailure: (row.on_failure as 'stop' | 'skip' | 'retry') || 'stop',
    retryConfig: safeJsonParse<RetryConfig | undefined>(row.retry_config as string, undefined, 'workflow.retryConfig'),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  });
}

export class SqliteWorkflowRepository implements WorkflowRepository {
  constructor(private readonly db: Database.Database) {}

  findAll(): Workflow[] {
    const rows = this.db.prepare('SELECT * FROM workflows ORDER BY created_at DESC').all();
    return rows.map(row => rowToWorkflow(row as Record<string, unknown>));
  }

  findById(id: string): Workflow | null {
    const row = this.db.prepare('SELECT * FROM workflows WHERE id = ?').get(id);
    return row ? rowToWorkflow(row as Record<string, unknown>) : null;
  }

  findEnabledWithSchedule(): Workflow[] {
    const rows = this.db
      .prepare("SELECT * FROM workflows WHERE enabled = 1 AND schedule IS NOT NULL AND schedule != ''")
      .all();
    return rows.map(row => rowToWorkflow(row as Record<string, unknown>));
  }

  create(data: CreateWorkflowRequest): Workflow {
    const id = uuidv4();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO workflows (
        id, name, enabled, schedule, inputs, steps, rules,
        skills, limits, output, working_directory, on_failure, retry_config, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.name,
      data.enabled !== false ? 1 : 0,
      data.schedule || null,
      data.inputs ? JSON.stringify(data.inputs) : null,
      JSON.stringify(data.steps),
      data.rules || null,
      data.skills ? JSON.stringify(data.skills) : null,
      data.limits ? JSON.stringify(data.limits) : null,
      data.output ? JSON.stringify(data.output) : null,
      data.workingDirectory || null,
      data.onFailure || 'stop',
      data.retryConfig ? JSON.stringify(data.retryConfig) : null,
      now,
      now
    );

    return this.findById(id)!;
  }

  update(id: string, data: UpdateWorkflowRequest): Workflow | null {
    if (!this.findById(id)) return null;

    const now = new Date().toISOString();
    const fields: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.enabled !== undefined) { fields.push('enabled = ?'); values.push(data.enabled ? 1 : 0); }
    if (data.schedule !== undefined) { fields.push('schedule = ?'); values.push(data.schedule || null); }
    if (data.inputs !== undefined) { fields.push('inputs = ?'); values.push(data.inputs ? JSON.stringify(data.inputs) : null); }
    if (data.steps !== undefined) { fields.push('steps = ?'); values.push(JSON.stringify(data.steps)); }
    if (data.rules !== undefined) { fields.push('rules = ?'); values.push(data.rules || null); }
    if (data.skills !== undefined) { fields.push('skills = ?'); values.push(data.skills ? JSON.stringify(data.skills) : null); }
    if (data.limits !== undefined) { fields.push('limits = ?'); values.push(data.limits ? JSON.stringify(data.limits) : null); }
    if (data.output !== undefined) { fields.push('output = ?'); values.push(data.output ? JSON.stringify(data.output) : null); }
    if (data.workingDirectory !== undefined) { fields.push('working_directory = ?'); values.push(data.workingDirectory || null); }
    if (data.onFailure !== undefined) { fields.push('on_failure = ?'); values.push(data.onFailure); }
    if (data.retryConfig !== undefined) { fields.push('retry_config = ?'); values.push(data.retryConfig ? JSON.stringify(data.retryConfig) : null); }

    values.push(id);
    this.db.prepare(`UPDATE workflows SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    return this.findById(id);
  }

  toggle(id: string): Workflow | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    this.db.prepare('UPDATE workflows SET enabled = ?, updated_at = ? WHERE id = ?')
      .run(existing.enabled ? 0 : 1, now, id);

    return this.findById(id);
  }

  remove(id: string): boolean {
    const result = this.db.prepare('DELETE FROM workflows WHERE id = ?').run(id);
    return result.changes > 0;
  }
}
