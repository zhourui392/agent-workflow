/**
 * Skill 实体
 */
import { Entity } from '../../../shared/domain';

export interface CreateSkillInput {
  name: string;
  description?: string;
  allowedTools?: string[];
  content: string;
  enabled?: boolean;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  allowedTools?: string[];
  content?: string;
  enabled?: boolean;
}

export class Skill extends Entity {
  readonly name: string;
  readonly description?: string;
  readonly allowedTools?: string[];
  readonly content: string;
  private _enabled: boolean;

  constructor(props: {
    id: string;
    name: string;
    description?: string;
    allowedTools?: string[];
    content: string;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
  }) {
    super(props.id, props.createdAt, props.updatedAt);
    this.name = props.name;
    this.description = props.description;
    this.allowedTools = props.allowedTools;
    this.content = props.content;
    this._enabled = props.enabled;
  }

  get enabled(): boolean {
    return this._enabled;
  }
}
