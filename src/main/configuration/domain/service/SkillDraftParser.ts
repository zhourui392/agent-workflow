/**
 * SKILL.md 文本解析器
 *
 * 从 YAML frontmatter 中提取 name/description/allowed-tools，供 UI 展示与校验。
 * 不修改文件内容、不依赖文件系统，纯函数。
 */

import * as yaml from 'yaml';

const VALID_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

export class SkillDraftParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillDraftParseError';
  }
}

export interface SkillDraftMetadata {
  name: string;
  description?: string;
  allowedTools?: string[];
}

function extractFrontmatter(md: string): string {
  if (!md.startsWith('---')) {
    throw new SkillDraftParseError('SKILL.md 缺少 YAML frontmatter');
  }
  const rest = md.slice(3);
  const endIdx = rest.indexOf('\n---');
  if (endIdx === -1) {
    throw new SkillDraftParseError('SKILL.md frontmatter 未闭合');
  }
  return rest.slice(0, endIdx);
}

function normalizeAllowedTools(raw: unknown): string[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed === '') return undefined;
    return trimmed.split(',').map(s => s.trim()).filter(s => s.length > 0);
  }
  if (Array.isArray(raw)) {
    const items = raw.map(item => String(item).trim()).filter(s => s.length > 0);
    return items.length > 0 ? items : undefined;
  }
  throw new SkillDraftParseError(`allowed-tools 格式非法: ${typeof raw}`);
}

export function parseSkillMd(md: string): SkillDraftMetadata {
  if (!md || md.trim() === '') {
    throw new SkillDraftParseError('SKILL.md 为空');
  }

  const frontmatter = extractFrontmatter(md);
  let data: Record<string, unknown>;
  try {
    data = (yaml.parse(frontmatter) || {}) as Record<string, unknown>;
  } catch (error) {
    throw new SkillDraftParseError(
      `frontmatter YAML 解析失败: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const rawName = data.name;
  if (typeof rawName !== 'string' || rawName.trim() === '') {
    throw new SkillDraftParseError('frontmatter 缺少 name 字段');
  }
  const name = rawName.trim();
  if (!VALID_NAME_RE.test(name)) {
    throw new SkillDraftParseError(`name 含非法字符: "${name}"`);
  }

  const rawDesc = data.description;
  const description = typeof rawDesc === 'string' && rawDesc.trim() !== ''
    ? rawDesc.trim()
    : undefined;

  const allowedTools = normalizeAllowedTools(data['allowed-tools']);

  return { name, description, allowedTools };
}
