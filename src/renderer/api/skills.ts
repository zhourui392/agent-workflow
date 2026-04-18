/**
 * Skills API 适配层
 *
 * v3 架构下 Skill 数据由 global_config/skills/{name}/ 目录承载，
 * description/allowedTools 来自 SKILL.md frontmatter，数据库只存元数据。
 */

import {
  getSkills as getSkillsApi,
  getAllSkills as getAllSkillsApi,
  getSkill as getSkillApi,
  deleteSkill as deleteSkillApi,
  setSkillEnabled as setSkillEnabledApi,
  generateSkill as generateSkillApi,
  getSkillDraft as getSkillDraftApi,
  verifySkill as verifySkillApi,
  saveSkillFromDraft as saveSkillFromDraftApi,
  cancelSkillGeneration as cancelSkillGenerationApi,
  subscribeSkillGeneration as subscribeSkillGenerationApi,
  type SkillDTO,
  type SkillDraftDTO,
  type SkillGenerationEvent
} from './index';

export type { SkillDraftDTO, SkillGenerationEvent };

/**
 * Skill 前端数据格式
 */
export interface SkillData {
  id: string;
  name: string;
  dir_path: string;
  description: string | null;
  allowed_tools: string[] | null;
  enabled: boolean;
  source?: 'db' | 'cli';
  created_at: string;
  updated_at: string;
}

/**
 * 更新 Skill 输入（前端格式）
 *
 * v1 只支持切换 enabled；其他字段（name/content/allowed-tools）应通过
 * 文件系统直接编辑 SKILL.md 或通过 /api/skills/generate 重新生成。
 */
export interface UpdateSkillData {
  enabled?: boolean;
}

function skillToData(skill: SkillDTO & { source?: string; dirPath?: string }): SkillData {
  return {
    id: skill.id,
    name: skill.name,
    dir_path: skill.dirPath ?? '',
    description: skill.description || null,
    allowed_tools: skill.allowedTools || null,
    enabled: skill.enabled,
    source: skill.source === 'cli' ? 'cli' : 'db',
    created_at: skill.createdAt,
    updated_at: skill.updatedAt
  };
}

export async function listSkills() {
  const response = await getSkillsApi();
  return { data: response.data.map(skillToData) };
}

export async function listAllSkills() {
  const response = await getAllSkillsApi();
  return { data: response.data.map(skill => skillToData(skill as SkillDTO & { source?: string })) };
}

export async function getSkill(id: string) {
  const response = await getSkillApi(id);
  return { data: response.data ? skillToData(response.data) : null };
}

export async function deleteSkill(id: string) {
  return deleteSkillApi(id);
}

export async function setSkillEnabled(id: string, enabled: boolean) {
  const response = await setSkillEnabledApi(id, enabled);
  return { data: response.data ? skillToData(response.data) : null };
}

// ============ Skill Generation ============

export async function generateSkill(prompt: string, model?: string) {
  const response = await generateSkillApi(prompt, model);
  return { data: response.data };
}

export async function getSkillDraft(generationId: string) {
  const response = await getSkillDraftApi(generationId);
  return { data: response.data };
}

export async function verifySkill(generationId: string, testPrompt: string, model?: string) {
  const response = await verifySkillApi(generationId, testPrompt, model);
  return { data: response.data };
}

export async function saveSkillFromDraft(generationId: string, enabled?: boolean) {
  const response = await saveSkillFromDraftApi(generationId, enabled);
  return { data: skillToData(response.data) };
}

export async function cancelSkillGeneration(generationId: string) {
  return cancelSkillGenerationApi(generationId);
}

export function subscribeSkillGeneration(
  generationId: string,
  callback: (event: SkillGenerationEvent) => void
): () => void {
  return subscribeSkillGenerationApi(event => {
    if (event.generationId === generationId) {
      callback(event);
    }
  });
}
