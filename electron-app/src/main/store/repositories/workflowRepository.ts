/**
 * 工作流数据访问层
 *
 * @author zhourui(V33215020)
 * @since 2026/03/11
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database';
import type {
  Workflow,
  CreateWorkflowRequest,
  UpdateWorkflowRequest
} from '../models';

/**
 * 数据库行转换为Workflow对象
 *
 * @param row 数据库行数据
 * @returns Workflow对象
 */
function rowToWorkflow(row: Record<string, unknown>): Workflow {
  return {
    id: row.id as string,
    name: row.name as string,
    enabled: Boolean(row.enabled),
    schedule: row.schedule as string | undefined,
    inputs: row.inputs ? JSON.parse(row.inputs as string) : undefined,
    steps: JSON.parse(row.steps as string),
    rules: row.rules as string | undefined,
    mcpServers: row.mcp_servers ? JSON.parse(row.mcp_servers as string) : undefined,
    skills: row.skills ? JSON.parse(row.skills as string) : undefined,
    limits: row.limits ? JSON.parse(row.limits as string) : undefined,
    output: row.output ? JSON.parse(row.output as string) : undefined,
    onFailure: (row.on_failure as 'stop' | 'skip' | 'retry') || 'stop',
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  };
}

/**
 * 获取所有工作流列表
 *
 * @returns 工作流列表
 */
export function findAll(): Workflow[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM workflows ORDER BY created_at DESC').all();
  return rows.map(row => rowToWorkflow(row as Record<string, unknown>));
}

/**
 * 根据ID查找工作流
 *
 * @param id 工作流ID
 * @returns 工作流对象，不存在则返回null
 */
export function findById(id: string): Workflow | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM workflows WHERE id = ?').get(id);
  return row ? rowToWorkflow(row as Record<string, unknown>) : null;
}

/**
 * 查找所有启用且有定时任务的工作流
 *
 * @returns 工作流列表
 */
export function findEnabledWithSchedule(): Workflow[] {
  const db = getDatabase();
  const rows = db
    .prepare('SELECT * FROM workflows WHERE enabled = 1 AND schedule IS NOT NULL AND schedule != ""')
    .all();
  return rows.map(row => rowToWorkflow(row as Record<string, unknown>));
}

/**
 * 创建新工作流
 *
 * @param data 创建请求数据
 * @returns 创建的工作流对象
 */
export function create(data: CreateWorkflowRequest): Workflow {
  const db = getDatabase();
  const id = uuidv4();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO workflows (
      id, name, enabled, schedule, inputs, steps, rules,
      mcp_servers, skills, limits, output, on_failure, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    data.name,
    data.enabled !== false ? 1 : 0,
    data.schedule || null,
    data.inputs ? JSON.stringify(data.inputs) : null,
    JSON.stringify(data.steps),
    data.rules || null,
    data.mcpServers ? JSON.stringify(data.mcpServers) : null,
    data.skills ? JSON.stringify(data.skills) : null,
    data.limits ? JSON.stringify(data.limits) : null,
    data.output ? JSON.stringify(data.output) : null,
    data.onFailure || 'stop',
    now,
    now
  );

  return findById(id)!;
}

/**
 * 更新工作流
 *
 * @param id 工作流ID
 * @param data 更新请求数据
 * @returns 更新后的工作流对象，不存在则返回null
 */
export function update(id: string, data: UpdateWorkflowRequest): Workflow | null {
  const existing = findById(id);
  if (!existing) {
    return null;
  }

  const db = getDatabase();
  const now = new Date().toISOString();

  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [now];

  if (data.name !== undefined) {
    fields.push('name = ?');
    values.push(data.name);
  }
  if (data.enabled !== undefined) {
    fields.push('enabled = ?');
    values.push(data.enabled ? 1 : 0);
  }
  if (data.schedule !== undefined) {
    fields.push('schedule = ?');
    values.push(data.schedule || null);
  }
  if (data.inputs !== undefined) {
    fields.push('inputs = ?');
    values.push(data.inputs ? JSON.stringify(data.inputs) : null);
  }
  if (data.steps !== undefined) {
    fields.push('steps = ?');
    values.push(JSON.stringify(data.steps));
  }
  if (data.rules !== undefined) {
    fields.push('rules = ?');
    values.push(data.rules || null);
  }
  if (data.mcpServers !== undefined) {
    fields.push('mcp_servers = ?');
    values.push(data.mcpServers ? JSON.stringify(data.mcpServers) : null);
  }
  if (data.skills !== undefined) {
    fields.push('skills = ?');
    values.push(data.skills ? JSON.stringify(data.skills) : null);
  }
  if (data.limits !== undefined) {
    fields.push('limits = ?');
    values.push(data.limits ? JSON.stringify(data.limits) : null);
  }
  if (data.output !== undefined) {
    fields.push('output = ?');
    values.push(data.output ? JSON.stringify(data.output) : null);
  }
  if (data.onFailure !== undefined) {
    fields.push('on_failure = ?');
    values.push(data.onFailure);
  }

  values.push(id);

  const stmt = db.prepare(`UPDATE workflows SET ${fields.join(', ')} WHERE id = ?`);
  stmt.run(...values);

  return findById(id);
}

/**
 * 切换工作流启用状态
 *
 * @param id 工作流ID
 * @returns 更新后的工作流对象，不存在则返回null
 */
export function toggle(id: string): Workflow | null {
  const existing = findById(id);
  if (!existing) {
    return null;
  }

  const db = getDatabase();
  const now = new Date().toISOString();

  const stmt = db.prepare('UPDATE workflows SET enabled = ?, updated_at = ? WHERE id = ?');
  stmt.run(existing.enabled ? 0 : 1, now, id);

  return findById(id);
}

/**
 * 删除工作流
 *
 * @param id 工作流ID
 * @returns 是否删除成功
 */
export function remove(id: string): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM workflows WHERE id = ?').run(id);
  return result.changes > 0;
}
