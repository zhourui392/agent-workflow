/**
 * 工作流业务服务
 *
 * @author zhourui(V33215020)
 * @since 2026/03/11
 */

import log from 'electron-log';
import { workflowRepository } from '../store/repositories';
import * as cronManager from '../scheduler/cronManager';
import { executePipeline } from '../core/pipeline';
import type {
  Workflow,
  CreateWorkflowRequest,
  UpdateWorkflowRequest
} from '../store/models';

/**
 * 获取所有工作流列表
 *
 * @returns 工作流列表
 */
export function list(): Workflow[] {
  return workflowRepository.findAll();
}

/**
 * 根据ID获取工作流
 *
 * @param id 工作流ID
 * @returns 工作流对象，不存在则返回null
 */
export function get(id: string): Workflow | null {
  return workflowRepository.findById(id);
}

/**
 * 创建工作流
 *
 * @param data 创建请求数据
 * @returns 创建的工作流对象
 */
export function create(data: CreateWorkflowRequest): Workflow {
  const workflow = workflowRepository.create(data);
  log.info(`Created workflow: ${workflow.id} - ${workflow.name}`);

  cronManager.registerWorkflow(workflow);

  return workflow;
}

/**
 * 更新工作流
 *
 * @param id 工作流ID
 * @param data 更新请求数据
 * @returns 更新后的工作流对象，不存在则返回null
 */
export function update(id: string, data: UpdateWorkflowRequest): Workflow | null {
  const workflow = workflowRepository.update(id, data);
  if (!workflow) {
    return null;
  }

  log.info(`Updated workflow: ${id}`);

  cronManager.registerWorkflow(workflow);

  return workflow;
}

/**
 * 删除工作流
 *
 * @param id 工作流ID
 * @returns 是否删除成功
 */
export function remove(id: string): boolean {
  cronManager.unregisterWorkflow(id);

  const result = workflowRepository.remove(id);
  if (result) {
    log.info(`Deleted workflow: ${id}`);
  }

  return result;
}

/**
 * 切换工作流启用状态
 *
 * @param id 工作流ID
 * @returns 更新后的工作流对象，不存在则返回null
 */
export function toggle(id: string): Workflow | null {
  const workflow = workflowRepository.toggle(id);
  if (!workflow) {
    return null;
  }

  log.info(`Toggled workflow ${id}: enabled=${workflow.enabled}`);

  if (workflow.enabled) {
    cronManager.registerWorkflow(workflow);
  } else {
    cronManager.unregisterWorkflow(id);
  }

  return workflow;
}

/**
 * 手动执行工作流
 *
 * @param id 工作流ID
 * @param inputs 输入参数
 * @returns 执行ID，工作流不存在则返回null
 */
export async function run(
  id: string,
  inputs: Record<string, unknown> = {}
): Promise<string | null> {
  const workflow = workflowRepository.findById(id);
  if (!workflow) {
    return null;
  }

  log.info(`Manual execution triggered for workflow: ${workflow.name}`);

  const executionId = await executePipeline(workflow, inputs, 'manual');

  return executionId;
}
