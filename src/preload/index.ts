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
  McpServerConfig,
  McpServer,
  Skill,
  CreateMcpServerInput,
  UpdateMcpServerInput,
  CreateSkillInput,
  UpdateSkillInput
} from '../main/types';

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

  // MCP Servers
  getMcpServers: () => Promise<McpServer[]>;
  getAllMcpServers: () => Promise<McpServer[]>;
  getMcpServer: (id: string) => Promise<McpServer | null>;
  createMcpServer: (data: CreateMcpServerInput) => Promise<McpServer>;
  updateMcpServer: (id: string, data: UpdateMcpServerInput) => Promise<McpServer | null>;
  deleteMcpServer: (id: string) => Promise<boolean>;
  setMcpServerEnabled: (id: string, enabled: boolean) => Promise<McpServer | null>;

  // Skills
  getSkills: () => Promise<Skill[]>;
  getAllSkills: () => Promise<Skill[]>;
  getSkill: (id: string) => Promise<Skill | null>;
  createSkill: (data: CreateSkillInput) => Promise<Skill>;
  updateSkill: (id: string, data: UpdateSkillInput) => Promise<Skill | null>;
  deleteSkill: (id: string) => Promise<boolean>;
  setSkillEnabled: (id: string, enabled: boolean) => Promise<Skill | null>;

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

  // MCP Servers
  getMcpServers: () => ipcRenderer.invoke('mcp-servers:list'),
  getAllMcpServers: () => ipcRenderer.invoke('mcp-servers:list-all'),
  getMcpServer: (id) => ipcRenderer.invoke('mcp-servers:get', id),
  createMcpServer: (data) => ipcRenderer.invoke('mcp-servers:create', data),
  updateMcpServer: (id, data) => ipcRenderer.invoke('mcp-servers:update', id, data),
  deleteMcpServer: (id) => ipcRenderer.invoke('mcp-servers:delete', id),
  setMcpServerEnabled: (id, enabled) => ipcRenderer.invoke('mcp-servers:set-enabled', id, enabled),

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
