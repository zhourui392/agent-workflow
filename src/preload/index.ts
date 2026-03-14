/**
 * Preload脚本 - 暴露安全的API到渲染进程
 *
 * @author zhourui(V33215020)
 * @since 2026/03/11
 */

import { contextBridge, ipcRenderer } from 'electron';
import type {
  WorkflowDTO,
  ExecutionDTO,
  GlobalConfig,
  CreateWorkflowRequest,
  UpdateWorkflowRequest,
  ExecutionListParams,
  ExecutionProgressEvent,
  SkillDTO,
  CreateSkillInput,
  UpdateSkillInput
} from '../main/types';

/**
 * API接口定义
 */
export interface ElectronAPI {
  // Workflows
  getWorkflows: () => Promise<WorkflowDTO[]>;
  getWorkflow: (id: string) => Promise<WorkflowDTO | null>;
  createWorkflow: (data: CreateWorkflowRequest) => Promise<WorkflowDTO>;
  updateWorkflow: (id: string, data: UpdateWorkflowRequest) => Promise<WorkflowDTO | null>;
  deleteWorkflow: (id: string) => Promise<boolean>;
  toggleWorkflow: (id: string) => Promise<WorkflowDTO | null>;
  cloneWorkflow: (id: string) => Promise<WorkflowDTO | null>;
  runWorkflow: (id: string, inputs?: Record<string, unknown>) => Promise<string | null>;

  // Executions
  getExecutions: (params?: ExecutionListParams) => Promise<ExecutionDTO[]>;
  getExecution: (id: string) => Promise<ExecutionDTO | null>;
  getChildExecutions: (parentExecutionId: string) => Promise<ExecutionDTO[]>;

  // Executions (actions)
  cancelExecution: (id: string) => Promise<boolean>;

  // Config
  getConfig: () => Promise<GlobalConfig>;
  updateConfig: (data: {
    systemPrompt?: string;
    defaultModel?: string;
  }) => Promise<{ success: boolean }>;

  // Skills
  getSkills: () => Promise<SkillDTO[]>;
  getAllSkills: () => Promise<SkillDTO[]>;
  getSkill: (id: string) => Promise<SkillDTO | null>;
  createSkill: (data: CreateSkillInput) => Promise<SkillDTO>;
  updateSkill: (id: string, data: UpdateSkillInput) => Promise<SkillDTO | null>;
  deleteSkill: (id: string) => Promise<boolean>;
  setSkillEnabled: (id: string, enabled: boolean) => Promise<SkillDTO | null>;

  // Real-time events
  onExecutionProgress: (callback: (data: ExecutionProgressEvent) => void) => () => void;
}

const api: ElectronAPI = {
  // Workflows
  getWorkflows: () => ipcRenderer.invoke('workflows:list'),
  getWorkflow: (id) => ipcRenderer.invoke('workflows:get', id),
  createWorkflow: (data) => ipcRenderer.invoke('workflows:create', data),
  updateWorkflow: (id, data) => ipcRenderer.invoke('workflows:update', id, data),
  deleteWorkflow: (id) => ipcRenderer.invoke('workflows:delete', id),
  toggleWorkflow: (id) => ipcRenderer.invoke('workflows:toggle', id),
  cloneWorkflow: (id) => ipcRenderer.invoke('workflows:clone', id),
  runWorkflow: (id, inputs) => ipcRenderer.invoke('workflows:run', id, inputs),

  // Executions
  getExecutions: (params) => ipcRenderer.invoke('executions:list', params),
  getExecution: (id) => ipcRenderer.invoke('executions:get', id),
  getChildExecutions: (parentId) => ipcRenderer.invoke('executions:children', parentId),
  cancelExecution: (id) => ipcRenderer.invoke('executions:cancel', id),

  // Config
  getConfig: () => ipcRenderer.invoke('config:get'),
  updateConfig: (data) => ipcRenderer.invoke('config:update', data),

  // Skills
  getSkills: () => ipcRenderer.invoke('skills:list'),
  getAllSkills: () => ipcRenderer.invoke('skills:list-all'),
  getSkill: (id) => ipcRenderer.invoke('skills:get', id),
  createSkill: (data) => ipcRenderer.invoke('skills:create', data),
  updateSkill: (id, data) => ipcRenderer.invoke('skills:update', id, data),
  deleteSkill: (id) => ipcRenderer.invoke('skills:delete', id),
  setSkillEnabled: (id, enabled) => ipcRenderer.invoke('skills:set-enabled', id, enabled),

  // Real-time events
  onExecutionProgress: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, data: ExecutionProgressEvent) => {
      callback(data);
    };
    ipcRenderer.on('execution:progress', handler);
    return () => {
      ipcRenderer.removeListener('execution:progress', handler);
    };
  }
};

contextBridge.exposeInMainWorld('api', api);

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
