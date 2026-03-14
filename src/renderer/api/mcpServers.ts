/**
 * MCP 服务 API 适配层
 *
 * @author zhourui(V33215020)
 * @since 2026/03/12
 */

import {
  getMcpServers as getMcpServersApi,
  getAllMcpServers as getAllMcpServersApi,
  getMcpServer as getMcpServerApi,
  createMcpServer as createMcpServerApi,
  updateMcpServer as updateMcpServerApi,
  deleteMcpServer as deleteMcpServerApi,
  setMcpServerEnabled as setMcpServerEnabledApi,
  type McpServerDTO
} from './index';

/**
 * MCP 服务前端数据格式
 */
export interface McpServerData {
  id: string;
  name: string;
  description: string | null;
  command: string;
  args: string[] | null;
  env: Record<string, string> | null;
  enabled: boolean;
  source?: 'db' | 'cli';
  created_at: string;
  updated_at: string;
}

/**
 * 创建 MCP 服务输入（前端格式）
 */
export interface CreateMcpServerData {
  name: string;
  description?: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
}

/**
 * 更新 MCP 服务输入（前端格式）
 */
export interface UpdateMcpServerData {
  name?: string;
  description?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
}

/**
 * 将后端 McpServer 转换为前端 McpServerData
 *
 * @param server 后端数据
 * @returns 前端数据
 */
function serverToData(server: McpServerDTO): McpServerData {
  return {
    id: server.id,
    name: server.name,
    description: server.description || null,
    command: server.command,
    args: server.args || null,
    env: server.env || null,
    enabled: server.enabled,
    created_at: server.createdAt,
    updated_at: server.updatedAt
  };
}

/**
 * 将前端创建数据转换为后端输入
 *
 * @param data 前端数据
 * @returns 后端输入
 */
function createDataToInput(data: CreateMcpServerData) {
  return {
    name: data.name,
    description: data.description,
    command: data.command,
    args: data.args,
    env: data.env,
    enabled: data.enabled
  };
}

/**
 * 将前端更新数据转换为后端输入
 *
 * @param data 前端数据
 * @returns 后端输入
 */
function updateDataToInput(data: UpdateMcpServerData) {
  return {
    name: data.name,
    description: data.description,
    command: data.command,
    args: data.args,
    env: data.env,
    enabled: data.enabled
  };
}

/**
 * 获取 MCP 服务列表（仅数据库）
 */
export async function listMcpServers() {
  const response = await getMcpServersApi();
  return {
    data: response.data.map(serverToData)
  };
}

/**
 * 获取所有 MCP 服务（数据库 + Claude CLI）
 */
export async function listAllMcpServers() {
  const response = await getAllMcpServersApi();
  return {
    data: response.data.map(server => serverToDataWithSource(server))
  };
}

/**
 * 将后端 McpServer 转换为前端 McpServerData（带来源标记）
 *
 * @param server 后端数据
 * @returns 前端数据
 */
function serverToDataWithSource(server: McpServerDTO & { source?: string }): McpServerData {
  return {
    id: server.id,
    name: server.name,
    description: server.description || null,
    command: server.command,
    args: server.args || null,
    env: server.env || null,
    enabled: server.enabled,
    source: server.source === 'cli' ? 'cli' : 'db',
    created_at: server.createdAt,
    updated_at: server.updatedAt
  };
}

/**
 * 获取单个 MCP 服务
 *
 * @param id MCP 服务 ID
 */
export async function getMcpServer(id: string) {
  const response = await getMcpServerApi(id);
  return {
    data: response.data ? serverToData(response.data) : null
  };
}

/**
 * 创建 MCP 服务
 *
 * @param data 创建数据
 */
export async function createMcpServer(data: CreateMcpServerData) {
  const input = createDataToInput(data);
  const response = await createMcpServerApi(input);
  return {
    data: serverToData(response.data)
  };
}

/**
 * 更新 MCP 服务
 *
 * @param id MCP 服务 ID
 * @param data 更新数据
 */
export async function updateMcpServer(id: string, data: UpdateMcpServerData) {
  const input = updateDataToInput(data);
  const response = await updateMcpServerApi(id, input);
  return {
    data: response.data ? serverToData(response.data) : null
  };
}

/**
 * 删除 MCP 服务
 *
 * @param id MCP 服务 ID
 */
export async function deleteMcpServer(id: string) {
  return deleteMcpServerApi(id);
}

/**
 * 设置 MCP 服务启用状态
 *
 * @param id MCP 服务 ID
 * @param enabled 是否启用
 */
export async function setMcpServerEnabled(id: string, enabled: boolean) {
  const response = await setMcpServerEnabledApi(id, enabled);
  return {
    data: response.data ? serverToData(response.data) : null
  };
}
