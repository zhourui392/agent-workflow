/**
 * Preload脚本 - 暴露安全的API到渲染进程
 *
 * @author zhourui(V33215020)
 * @since 2026/03/11
 */

import { contextBridge, ipcRenderer } from 'electron';
import type {
  Workflow,
  Execution,
  GlobalConfig,
  CreateWorkflowRequest,
  UpdateWorkflowRequest,
  ExecutionListParams,
  ExecutionProgressEvent,
  McpServerConfig
} from '../main/store/models';

/**
 * API接口定义
 */
export interface ElectronAPI {
  // Workflows
  getWorkflows: () => Promise<Workflow[]>;
  getWorkflow: (id: string) => Promise<Workflow | null>;
  createWorkflow: (data: CreateWorkflowRequest) => Promise<Workflow>;
  updateWorkflow: (id: string, data: UpdateWorkflowRequest) => Promise<Workflow | null>;
  deleteWorkflow: (id: string) => Promise<boolean>;
  toggleWorkflow: (id: string) => Promise<Workflow | null>;
  runWorkflow: (id: string, inputs?: Record<string, unknown>) => Promise<string | null>;

  // Executions
  getExecutions: (params?: ExecutionListParams) => Promise<Execution[]>;
  getExecution: (id: string) => Promise<Execution | null>;

  // Config
  getConfig: () => Promise<GlobalConfig>;
  updateConfig: (data: {
    systemPrompt?: string;
    defaultModel?: string;
    mcpServers?: Record<string, McpServerConfig>;
  }) => Promise<{ success: boolean }>;

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
  runWorkflow: (id, inputs) => ipcRenderer.invoke('workflows:run', id, inputs),

  // Executions
  getExecutions: (params) => ipcRenderer.invoke('executions:list', params),
  getExecution: (id) => ipcRenderer.invoke('executions:get', id),

  // Config
  getConfig: () => ipcRenderer.invoke('config:get'),
  updateConfig: (data) => ipcRenderer.invoke('config:update', data),

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
