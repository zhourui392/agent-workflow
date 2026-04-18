/**
 * SkillDraftStore 接口
 *
 * 在内存中暂存生成中的 SkillDraft，直到用户确认保存或取消。
 * 进程重启即失效（本 MVP 不持久化）。
 */

import type { SkillDraft } from '../model/SkillDraft';

export interface SkillDraftStore {
  put(draft: SkillDraft): void;
  get(generationId: string): SkillDraft | null;
  remove(generationId: string): void;
  listAll(): SkillDraft[];
}
