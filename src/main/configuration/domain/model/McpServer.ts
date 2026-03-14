/**
 * MCP 服务实体
 */
import { Entity } from '../../../shared/domain';
import type { McpServerConfig } from './McpServerConfig';

export interface CreateMcpServerInput {
  name: string;
  description?: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
}

export interface UpdateMcpServerInput {
  name?: string;
  description?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
}

export class McpServer extends Entity {
  readonly name: string;
  readonly description?: string;
  readonly command: string;
  readonly args?: string[];
  readonly env?: Record<string, string>;
  private _enabled: boolean;

  constructor(props: {
    id: string;
    name: string;
    description?: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
  }) {
    super(props.id, props.createdAt, props.updatedAt);
    this.name = props.name;
    this.description = props.description;
    this.command = props.command;
    this.args = props.args;
    this.env = props.env;
    this._enabled = props.enabled;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  toConfig(): McpServerConfig {
    return {
      command: this.command,
      args: this.args,
      env: this.env
    };
  }
}
