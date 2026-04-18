/**
 * InMemorySkillDraftStore
 *
 * 进程内暂存 SkillDraft 的简单 Map 实现。
 * 用户保存或取消后由上层显式 remove；进程重启即失效。
 */

import type { SkillDraft } from '../domain/model/SkillDraft';
import type { SkillDraftStore } from '../domain/repository/SkillDraftStore';

export class InMemorySkillDraftStore implements SkillDraftStore {
  private readonly drafts = new Map<string, SkillDraft>();

  put(draft: SkillDraft): void {
    this.drafts.set(draft.generationId, draft);
  }

  get(generationId: string): SkillDraft | null {
    return this.drafts.get(generationId) ?? null;
  }

  remove(generationId: string): void {
    this.drafts.delete(generationId);
  }

  listAll(): SkillDraft[] {
    return Array.from(this.drafts.values());
  }
}
