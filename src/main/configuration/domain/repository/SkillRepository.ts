/**
 * Skill 仓库接口
 */
import type { Skill, CreateSkillInput, UpdateSkillInput } from '../model';

export interface SkillRepository {
  findAll(): Skill[];
  findById(id: string): Skill | null;
  findByIds(ids: string[]): Skill[];
  findEnabled(): Skill[];
  findByName(name: string): Skill | null;
  create(data: CreateSkillInput): Skill;
  update(id: string, data: UpdateSkillInput): Skill | null;
  setEnabled(id: string, enabled: boolean): Skill | null;
  remove(id: string): boolean;
}
