/**
 * Skill 实体
 *
 * 每个 Skill 对应 global_config/skills/{name}/ 下的一个目录，
 * 目录内必须包含 SKILL.md，可选包含 scripts/ references/ assets/ 等资源。
 *
 * 数据库仅保存元数据（id/name/enabled/时间戳 + dirPath），
 * description/allowedTools 由 Repository 从 SKILL.md frontmatter 懒加载注入。
 */
import { Entity } from '../../../shared/domain';

export interface CreateSkillInput {
  name: string;
  sourceDir: string;
  enabled?: boolean;
}

export interface UpdateSkillInput {
  enabled?: boolean;
}

export class Skill extends Entity {
  readonly name: string;
  readonly dirPath: string;
  readonly description?: string;
  readonly allowedTools?: string[];
  private _enabled: boolean;

  constructor(props: {
    id: string;
    name: string;
    dirPath: string;
    description?: string;
    allowedTools?: string[];
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
  }) {
    super(props.id, props.createdAt, props.updatedAt);
    this.name = props.name;
    this.dirPath = props.dirPath;
    this.description = props.description;
    this.allowedTools = props.allowedTools;
    this._enabled = props.enabled;
  }

  get enabled(): boolean {
    return this._enabled;
  }
}
