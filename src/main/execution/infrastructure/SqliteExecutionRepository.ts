/**
 * SQLite 执行记录仓储实现
 *
 * 实现 ExecutionRepository 接口，使用 better-sqlite3 同步操作。
 *
 * @author zhourui
 * @since 2026/03/14
 */

import { v4 as uuidv4 } from 'uuid';
import type Database from 'better-sqlite3';
import { Execution, StepExecution } from '../domain/model';
import type { ExecutionListParams } from '../domain/model';
import type { ExecutionRepository, SubExecutionParams } from '../domain/repository/ExecutionRepository';
import type { ExecutionStatus, TriggerType } from '../domain/model/ExecutionStatus';
import type { StepEvent } from '../domain/model/StepEvent';

/**
 * 数据库行转换为 Execution 聚合根
 */
function rowToExecution(row: Record<string, unknown>): Execution {
  return new Execution({
    id: row.id as string,
    workflowId: row.workflow_id as string,
    workflowName: row.workflow_name as string | undefined,
    triggerType: row.trigger_type as TriggerType,
    status: row.status as ExecutionStatus,
    startedAt: row.started_at as string,
    finishedAt: row.finished_at as string | undefined,
    currentStep: row.current_step as number,
    totalSteps: row.total_steps as number | undefined,
    totalTokens: row.total_tokens as number,
    errorMessage: row.error_message as string | undefined,
    parentExecutionId: row.parent_execution_id as string | undefined,
    parentStepIndex: row.parent_step_index as number | undefined,
    iterationIndex: row.iteration_index as number | undefined
  });
}

/**
 * 数据库行转换为 StepExecution 实体
 */
function rowToStepExecution(row: Record<string, unknown>): StepExecution {
  let events: StepEvent[] | undefined;
  if (row.events_json && typeof row.events_json === 'string') {
    try {
      events = JSON.parse(row.events_json);
    } catch {
      events = undefined;
    }
  }

  return new StepExecution({
    id: row.id as string,
    executionId: row.execution_id as string,
    stepIndex: row.step_index as number,
    status: row.status as ExecutionStatus,
    promptRendered: row.prompt_rendered as string | undefined,
    outputText: row.output_text as string | undefined,
    tokensUsed: row.tokens_used as number,
    modelUsed: row.model_used as string | undefined,
    errorMessage: row.error_message as string | undefined,
    validationStatus: row.validation_status as 'passed' | 'failed' | undefined,
    validationOutput: row.validation_output as string | undefined,
    events,
    createdAt: row.started_at as string,
    updatedAt: row.finished_at as string ?? row.started_at as string
  });
}

export class SqliteExecutionRepository implements ExecutionRepository {
  constructor(private readonly db: Database.Database) {}

  findAll(params?: ExecutionListParams): Execution[] {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (params?.workflowId) {
      conditions.push('e.workflow_id = ?');
      values.push(params.workflowId);
    }
    if (params?.status) {
      conditions.push('e.status = ?');
      values.push(params.status);
    }

    let sql = `SELECT e.*, w.name AS workflow_name,
      json_array_length(w.steps) AS total_steps
      FROM executions e LEFT JOIN workflows w ON e.workflow_id = w.id`;
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    sql += ' ORDER BY e.started_at DESC';

    if (params?.limit) {
      sql += ' LIMIT ?';
      values.push(params.limit);
    }
    if (params?.offset) {
      sql += ' OFFSET ?';
      values.push(params.offset);
    }

    const rows = this.db.prepare(sql).all(...values);
    return rows.map(row => rowToExecution(row as Record<string, unknown>));
  }

  count(params?: ExecutionListParams): number {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (params?.workflowId) {
      conditions.push('workflow_id = ?');
      values.push(params.workflowId);
    }
    if (params?.status) {
      conditions.push('status = ?');
      values.push(params.status);
    }

    let sql = 'SELECT COUNT(*) AS total FROM executions';
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    const row = this.db.prepare(sql).get(...values) as { total: number };
    return row.total;
  }

  findById(id: string): Execution | null {
    const row = this.db.prepare(`SELECT e.*, w.name AS workflow_name,
      json_array_length(w.steps) AS total_steps
      FROM executions e LEFT JOIN workflows w ON e.workflow_id = w.id WHERE e.id = ?`).get(id);
    return row ? rowToExecution(row as Record<string, unknown>) : null;
  }

  findByIdWithSteps(id: string): Execution | null {
    const execution = this.findById(id);
    if (!execution) {
      return null;
    }

    const workflowRow = this.db.prepare('SELECT steps FROM workflows WHERE id = ?').get(execution.workflowId);
    let stepNames: string[] = [];
    if (workflowRow && typeof (workflowRow as Record<string, unknown>).steps === 'string') {
      try {
        const steps = JSON.parse((workflowRow as Record<string, unknown>).steps as string);
        stepNames = steps.map((s: { name?: string }, idx: number) => s.name || `Step ${idx + 1}`);
      } catch {
        stepNames = [];
      }
    }

    const stepRows = this.db
      .prepare('SELECT * FROM step_executions WHERE execution_id = ? ORDER BY step_index')
      .all(id);

    execution.stepExecutions = stepRows.map((row) => {
      const stepExecution = rowToStepExecution(row as Record<string, unknown>);
      stepExecution.stepName = stepNames[stepExecution.stepIndex] || `Step ${stepExecution.stepIndex + 1}`;
      return stepExecution;
    });

    return execution;
  }

  create(workflowId: string, triggerType: TriggerType, subParams?: SubExecutionParams): Execution {
    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO executions (id, workflow_id, trigger_type, status, started_at, parent_execution_id, parent_step_index, iteration_index)
      VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)
    `);
    stmt.run(
      id, workflowId, triggerType, now,
      subParams?.parentExecutionId ?? null,
      subParams?.parentStepIndex ?? null,
      subParams?.iterationIndex ?? null
    );

    return this.findById(id)!;
  }

  findByParentExecutionId(parentExecutionId: string): Execution[] {
    const rows = this.db.prepare(`
      SELECT e.*, w.name AS workflow_name, json_array_length(w.steps) AS total_steps
      FROM executions e LEFT JOIN workflows w ON e.workflow_id = w.id
      WHERE e.parent_execution_id = ?
      ORDER BY e.iteration_index ASC, e.started_at ASC
    `).all(parentExecutionId);
    return rows.map(row => rowToExecution(row as Record<string, unknown>));
  }

  updateStatus(id: string, status: ExecutionStatus, errorMessage?: string): void {
    const now = new Date().toISOString();

    if (status === 'success' || status === 'failed' || status === 'cancelled') {
      const stmt = this.db.prepare(`
        UPDATE executions SET status = ?, finished_at = ?, error_message = ? WHERE id = ?
      `);
      stmt.run(status, now, errorMessage || null, id);
    } else {
      const stmt = this.db.prepare('UPDATE executions SET status = ? WHERE id = ?');
      stmt.run(status, id);
    }
  }

  updateCurrentStep(id: string, stepIndex: number): void {
    const stmt = this.db.prepare('UPDATE executions SET current_step = ? WHERE id = ?');
    stmt.run(stepIndex, id);
  }

  addTokens(id: string, tokens: number): void {
    const stmt = this.db.prepare('UPDATE executions SET total_tokens = total_tokens + ? WHERE id = ?');
    stmt.run(tokens, id);
  }

  createStepExecution(executionId: string, stepIndex: number, promptRendered: string): StepExecution {
    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO step_executions (id, execution_id, step_index, status, prompt_rendered, started_at)
      VALUES (?, ?, ?, 'running', ?, ?)
    `);
    stmt.run(id, executionId, stepIndex, promptRendered, now);

    const row = this.db.prepare('SELECT * FROM step_executions WHERE id = ?').get(id);
    return rowToStepExecution(row as Record<string, unknown>);
  }

  updateStepExecution(
    id: string,
    data: {
      status?: ExecutionStatus;
      outputText?: string;
      tokensUsed?: number;
      modelUsed?: string;
      errorMessage?: string;
      validationStatus?: 'passed' | 'failed';
      validationOutput?: string;
      eventsJson?: string;
    }
  ): void {
    const now = new Date().toISOString();
    const fields: string[] = [];
    const values: unknown[] = [];

    if (data.status !== undefined) {
      fields.push('status = ?');
      values.push(data.status);
      if (data.status === 'success' || data.status === 'failed') {
        fields.push('finished_at = ?');
        values.push(now);
      }
    }
    if (data.outputText !== undefined) {
      fields.push('output_text = ?');
      values.push(data.outputText);
    }
    if (data.tokensUsed !== undefined) {
      fields.push('tokens_used = ?');
      values.push(data.tokensUsed);
    }
    if (data.modelUsed !== undefined) {
      fields.push('model_used = ?');
      values.push(data.modelUsed);
    }
    if (data.errorMessage !== undefined) {
      fields.push('error_message = ?');
      values.push(data.errorMessage);
    }
    if (data.validationStatus !== undefined) {
      fields.push('validation_status = ?');
      values.push(data.validationStatus);
    }
    if (data.validationOutput !== undefined) {
      fields.push('validation_output = ?');
      values.push(data.validationOutput);
    }
    if (data.eventsJson !== undefined) {
      fields.push('events_json = ?');
      values.push(data.eventsJson);
    }

    if (fields.length === 0) {
      return;
    }

    values.push(id);
    const stmt = this.db.prepare(`UPDATE step_executions SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
  }

  deleteByWorkflowId(workflowId: string): void {
    this.db.prepare('DELETE FROM executions WHERE workflow_id = ?').run(workflowId);
  }
}
