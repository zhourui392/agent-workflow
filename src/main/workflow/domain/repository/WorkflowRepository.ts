/**
 * 工作流仓库接口
 */
import type { Workflow, CreateWorkflowRequest, UpdateWorkflowRequest } from '../model';

export interface WorkflowRepository {
  findAll(): Workflow[];
  findById(id: string): Workflow | null;
  findEnabledWithSchedule(): Workflow[];
  create(data: CreateWorkflowRequest): Workflow;
  update(id: string, data: UpdateWorkflowRequest): Workflow | null;
  toggle(id: string): Workflow | null;
  remove(id: string): boolean;
}
