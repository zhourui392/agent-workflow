/**
 * Skill 草稿（生成中/已生成/失败）
 *
 * 进程内暂存对象，记录 generationId 与其对应的临时工作目录及状态。
 */

export type SkillDraftStatus = 'generating' | 'generated' | 'failed';

export interface SkillDraft {
  generationId: string;
  status: SkillDraftStatus;
  /** 会话根工作目录（包含 skill 子目录） */
  workDir: string;
  /** 已生成时指向具体 skill 目录 */
  draftDir?: string;
  /** 已生成时的 skill name（来自 SKILL.md frontmatter） */
  draftName?: string;
  /** 来自 skill-creator JSON 输出的建议测试 prompt */
  suggestedTests: string[];
  /** 失败时的错误描述 */
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}
