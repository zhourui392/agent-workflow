/**
 * Skill 应用服务
 */

import * as fs from 'fs';
import * as path from 'path';
import log from '../../shared/infrastructure/logger';
import type { Skill, CreateSkillInput, UpdateSkillInput } from '../domain/model';
import type { SkillRepository } from '../domain/repository/SkillRepository';
import type { SkillDraftStore } from '../domain/repository/SkillDraftStore';
import type { SkillDraft } from '../domain/model/SkillDraft';
import type { CliConfigLoader } from '../infrastructure/CliConfigLoader';

/**
 * CLI Skill 配置项（用于前端显示）
 */
interface CliSkill {
  id: string;
  name: string;
  dirPath: string;
  description?: string;
  allowedTools?: string[];
  enabled: boolean;
  source: 'cli';
  createdAt: string;
  updatedAt: string;
}

export class SkillDraftNotFoundError extends Error {
  constructor(generationId: string) {
    super(`generationId 不存在或已过期: ${generationId}`);
    this.name = 'SkillDraftNotFoundError';
  }
}

export class SkillDraftStateError extends Error {
  constructor(generationId: string, status: string) {
    super(`草稿状态非 generated，无法保存: ${generationId} (status=${status})`);
    this.name = 'SkillDraftStateError';
  }
}

export class SkillNameConflictError extends Error {
  constructor(name: string) {
    super(`Skill 名称已存在: ${name}`);
    this.name = 'SkillNameConflictError';
  }
}

export class SkillApplicationService {
  constructor(
    private readonly repo: SkillRepository,
    private readonly cliConfigLoader: CliConfigLoader,
    private readonly draftStore: SkillDraftStore,
    private readonly skillGenerationTmpRoot: string
  ) {}

  list(): Skill[] {
    return this.repo.findAll();
  }

  listAll(): (Skill | CliSkill)[] {
    const dbSkills = this.repo.findAll();
    const cliSkills = this.cliConfigLoader.loadClaudeCliSkillsWithDetails();

    const result: (Skill | CliSkill)[] = [...dbSkills];
    const dbNames = new Set(dbSkills.map(s => s.name));
    const now = new Date().toISOString();

    for (const skill of cliSkills) {
      if (!dbNames.has(skill.name)) {
        result.push({
          id: `cli:${skill.name}`,
          name: skill.name,
          dirPath: skill.dirPath,
          description: skill.description,
          allowedTools: skill.allowedTools,
          enabled: true,
          source: 'cli',
          createdAt: now,
          updatedAt: now
        });
      }
    }

    return result;
  }

  get(id: string): Skill | null {
    return this.repo.findById(id);
  }

  create(data: CreateSkillInput): Skill {
    return this.repo.create(data);
  }

  update(id: string, data: UpdateSkillInput): Skill | null {
    return this.repo.update(id, data);
  }

  setEnabled(id: string, enabled: boolean): Skill | null {
    return this.repo.setEnabled(id, enabled);
  }

  remove(id: string): boolean {
    return this.repo.remove(id);
  }

  /**
   * 把 generated 状态的草稿落盘成正式 Skill，清理临时目录与草稿条目。
   */
  saveFromDraft(generationId: string, options: { enabled?: boolean }): Skill {
    const draft = this.draftStore.get(generationId);
    if (!draft) {
      throw new SkillDraftNotFoundError(generationId);
    }
    if (draft.status !== 'generated') {
      throw new SkillDraftStateError(generationId, draft.status);
    }
    if (!draft.draftDir || !draft.draftName) {
      throw new SkillDraftStateError(generationId, draft.status);
    }

    if (this.repo.findByName(draft.draftName)) {
      throw new SkillNameConflictError(draft.draftName);
    }

    const skill = this.repo.create({
      name: draft.draftName,
      sourceDir: draft.draftDir,
      enabled: options.enabled ?? true
    });

    this.cleanupDraft(generationId, draft);
    return skill;
  }

  /**
   * 取消草稿：清理临时目录与草稿条目。草稿不存在返回 false。
   */
  cancelDraft(generationId: string): boolean {
    const draft = this.draftStore.get(generationId);
    if (!draft) return false;
    this.cleanupDraft(generationId, draft);
    return true;
  }

  private cleanupDraft(generationId: string, draft: SkillDraft): void {
    const sessionRoot = path.dirname(draft.workDir);
    try {
      fs.rmSync(sessionRoot, { recursive: true, force: true });
    } catch (error) {
      log.warn('清理 skill 生成临时目录失败', { sessionRoot, error });
    }
    const verifyDir = path.join(this.skillGenerationTmpRoot, `skill-verify-${generationId}`);
    try {
      fs.rmSync(verifyDir, { recursive: true, force: true });
    } catch (error) {
      log.warn('清理 skill 验证临时目录失败', { verifyDir, error });
    }
    this.draftStore.remove(generationId);
  }
}
