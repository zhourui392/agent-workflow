/**
 * Skill 应用服务
 */

import type { Skill, CreateSkillInput, UpdateSkillInput } from '../domain/model';
import type { SkillRepository } from '../domain/repository/SkillRepository';
import type { CliConfigLoader, CliSkillDetail } from '../infrastructure/CliConfigLoader';

/**
 * CLI Skill 配置项（用于前端显示）
 */
interface CliSkill {
  id: string;
  name: string;
  description: string;
  allowedTools?: string[];
  content: string;
  enabled: boolean;
  source: 'cli';
  createdAt: string;
  updatedAt: string;
}

export class SkillApplicationService {
  constructor(
    private readonly repo: SkillRepository,
    private readonly cliConfigLoader: CliConfigLoader
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
          description: skill.description || 'Claude Code CLI Skill',
          allowedTools: skill.allowedTools,
          content: skill.content,
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
}
