/**
 * Skills API 适配层
 *
 * @author zhourui(V33215020)
 * @since 2026/03/12
 */

import {
  getSkills as getSkillsApi,
  getSkill as getSkillApi,
  createSkill as createSkillApi,
  updateSkill as updateSkillApi,
  deleteSkill as deleteSkillApi,
  setSkillEnabled as setSkillEnabledApi,
  type Skill
} from './index';

/**
 * Skill 前端数据格式
 */
export interface SkillData {
  id: string;
  name: string;
  description: string | null;
  allowed_tools: string[] | null;
  content: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * 创建 Skill 输入（前端格式）
 */
export interface CreateSkillData {
  name: string;
  description?: string;
  allowed_tools?: string[];
  content: string;
  enabled?: boolean;
}

/**
 * 更新 Skill 输入（前端格式）
 */
export interface UpdateSkillData {
  name?: string;
  description?: string;
  allowed_tools?: string[];
  content?: string;
  enabled?: boolean;
}

/**
 * 将后端 Skill 转换为前端 SkillData
 *
 * @param skill 后端数据
 * @returns 前端数据
 */
function skillToData(skill: Skill): SkillData {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description || null,
    allowed_tools: skill.allowedTools || null,
    content: skill.content,
    enabled: skill.enabled,
    created_at: skill.createdAt,
    updated_at: skill.updatedAt
  };
}

/**
 * 将前端创建数据转换为后端输入
 *
 * @param data 前端数据
 * @returns 后端输入
 */
function createDataToInput(data: CreateSkillData) {
  return {
    name: data.name,
    description: data.description,
    allowedTools: data.allowed_tools,
    content: data.content,
    enabled: data.enabled
  };
}

/**
 * 将前端更新数据转换为后端输入
 *
 * @param data 前端数据
 * @returns 后端输入
 */
function updateDataToInput(data: UpdateSkillData) {
  return {
    name: data.name,
    description: data.description,
    allowedTools: data.allowed_tools,
    content: data.content,
    enabled: data.enabled
  };
}

/**
 * 获取 Skill 列表
 */
export async function listSkills() {
  const response = await getSkillsApi();
  return {
    data: response.data.map(skillToData)
  };
}

/**
 * 获取单个 Skill
 *
 * @param id Skill ID
 */
export async function getSkill(id: string) {
  const response = await getSkillApi(id);
  return {
    data: response.data ? skillToData(response.data) : null
  };
}

/**
 * 创建 Skill
 *
 * @param data 创建数据
 */
export async function createSkill(data: CreateSkillData) {
  const input = createDataToInput(data);
  const response = await createSkillApi(input);
  return {
    data: skillToData(response.data)
  };
}

/**
 * 更新 Skill
 *
 * @param id Skill ID
 * @param data 更新数据
 */
export async function updateSkill(id: string, data: UpdateSkillData) {
  const input = updateDataToInput(data);
  const response = await updateSkillApi(id, input);
  return {
    data: response.data ? skillToData(response.data) : null
  };
}

/**
 * 删除 Skill
 *
 * @param id Skill ID
 */
export async function deleteSkill(id: string) {
  return deleteSkillApi(id);
}

/**
 * 设置 Skill 启用状态
 *
 * @param id Skill ID
 * @param enabled 是否启用
 */
export async function setSkillEnabled(id: string, enabled: boolean) {
  const response = await setSkillEnabledApi(id, enabled);
  return {
    data: response.data ? skillToData(response.data) : null
  };
}
