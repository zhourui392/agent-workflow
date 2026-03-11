/**
 * 执行记录数据访问层
 *
 * @author zhourui(V33215020)
 * @since 2026/03/11
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database';
import type {
  Execution,
  StepExecution,
  ExecutionStatus,
  TriggerType,
  ExecutionListParams
} from '../models';

/**
 * 数据库行转换为Execution对象
 *
 * @param row 数据库行数据
 * @returns Execution对象
 */
function rowToExecution(row: Record<string, unknown>): Execution {
  return {
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
    errorMessage: row.error_message as string | undefined
  };
}

/**
 * 数据库行转换为StepExecution对象
 *
 * @param row 数据库行数据
 * @returns StepExecution对象
 */
function rowToStepExecution(row: Record<string, unknown>): StepExecution {
  return {
    id: row.id as string,
    executionId: row.execution_id as string,
    stepIndex: row.step_index as number,
    status: row.status as ExecutionStatus,
    promptRendered: row.prompt_rendered as string | undefined,
    outputText: row.output_text as string | undefined,
    tokensUsed: row.tokens_used as number,
    modelUsed: row.model_used as string | undefined,
    errorMessage: row.error_message as string | undefined,
    startedAt: row.started_at as string,
    finishedAt: row.finished_at as string | undefined
  };
}

/**
 * 查询执行列表
 *
 * @param params 查询参数
 * @returns 执行记录列表
 */
export function findAll(params?: ExecutionListParams): Execution[] {
  const db = getDatabase();
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

  const rows = db.prepare(sql).all(...values);
  return rows.map(row => rowToExecution(row as Record<string, unknown>));
}

/**
 * 根据ID查找执行记录
 *
 * @param id 执行ID
 * @returns 执行记录，不存在则返回null
 */
export function findById(id: string): Execution | null {
  const db = getDatabase();
  const row = db.prepare(`SELECT e.*, w.name AS workflow_name,
    json_array_length(w.steps) AS total_steps
    FROM executions e LEFT JOIN workflows w ON e.workflow_id = w.id WHERE e.id = ?`).get(id);
  return row ? rowToExecution(row as Record<string, unknown>) : null;
}

/**
 * 根据ID查找执行记录（包含步骤执行详情）
 *
 * @param id 执行ID
 * @returns 执行记录（含步骤执行），不存在则返回null
 */
export function findByIdWithSteps(id: string): Execution | null {
  const execution = findById(id);
  if (!execution) {
    return null;
  }

  const db = getDatabase();
  const stepRows = db
    .prepare('SELECT * FROM step_executions WHERE execution_id = ? ORDER BY step_index')
    .all(id);

  execution.stepExecutions = stepRows.map(row =>
    rowToStepExecution(row as Record<string, unknown>)
  );

  return execution;
}

/**
 * 创建执行记录
 *
 * @param workflowId 工作流ID
 * @param triggerType 触发类型
 * @returns 创建的执行记录
 */
export function create(workflowId: string, triggerType: TriggerType): Execution {
  const db = getDatabase();
  const id = uuidv4();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO executions (id, workflow_id, trigger_type, status, started_at)
    VALUES (?, ?, ?, 'pending', ?)
  `);
  stmt.run(id, workflowId, triggerType, now);

  return findById(id)!;
}

/**
 * 更新执行状态
 *
 * @param id 执行ID
 * @param status 新状态
 * @param errorMessage 错误信息（可选）
 */
export function updateStatus(
  id: string,
  status: ExecutionStatus,
  errorMessage?: string
): void {
  const db = getDatabase();
  const now = new Date().toISOString();

  if (status === 'success' || status === 'failed') {
    const stmt = db.prepare(`
      UPDATE executions SET status = ?, finished_at = ?, error_message = ? WHERE id = ?
    `);
    stmt.run(status, now, errorMessage || null, id);
  } else {
    const stmt = db.prepare('UPDATE executions SET status = ? WHERE id = ?');
    stmt.run(status, id);
  }
}

/**
 * 更新当前步骤索引
 *
 * @param id 执行ID
 * @param stepIndex 当前步骤索引
 */
export function updateCurrentStep(id: string, stepIndex: number): void {
  const db = getDatabase();
  const stmt = db.prepare('UPDATE executions SET current_step = ? WHERE id = ?');
  stmt.run(stepIndex, id);
}

/**
 * 累加token使用量
 *
 * @param id 执行ID
 * @param tokens 本次使用的token数
 */
export function addTokens(id: string, tokens: number): void {
  const db = getDatabase();
  const stmt = db.prepare('UPDATE executions SET total_tokens = total_tokens + ? WHERE id = ?');
  stmt.run(tokens, id);
}

/**
 * 创建步骤执行记录
 *
 * @param executionId 执行ID
 * @param stepIndex 步骤索引
 * @param promptRendered 渲染后的prompt
 * @returns 步骤执行记录
 */
export function createStepExecution(
  executionId: string,
  stepIndex: number,
  promptRendered: string
): StepExecution {
  const db = getDatabase();
  const id = uuidv4();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO step_executions (id, execution_id, step_index, status, prompt_rendered, started_at)
    VALUES (?, ?, ?, 'running', ?, ?)
  `);
  stmt.run(id, executionId, stepIndex, promptRendered, now);

  const row = db.prepare('SELECT * FROM step_executions WHERE id = ?').get(id);
  return rowToStepExecution(row as Record<string, unknown>);
}

/**
 * 更新步骤执行记录
 *
 * @param id 步骤执行ID
 * @param data 更新数据
 */
export function updateStepExecution(
  id: string,
  data: {
    status?: ExecutionStatus;
    outputText?: string;
    tokensUsed?: number;
    modelUsed?: string;
    errorMessage?: string;
  }
): void {
  const db = getDatabase();
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

  if (fields.length === 0) {
    return;
  }

  values.push(id);
  const stmt = db.prepare(`UPDATE step_executions SET ${fields.join(', ')} WHERE id = ?`);
  stmt.run(...values);
}

/**
 * 删除工作流相关的所有执行记录
 *
 * @param workflowId 工作流ID
 */
export function deleteByWorkflowId(workflowId: string): void {
  const db = getDatabase();
  db.prepare('DELETE FROM executions WHERE workflow_id = ?').run(workflowId);
}
