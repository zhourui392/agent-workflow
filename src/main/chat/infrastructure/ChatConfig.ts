/**
 * Chat 模块配置
 *
 * 从环境变量读取 CLI 命令、参数、超时、环境前缀表。所有字段都有合理默认值，
 * 未设置时按 agent-web 的默认行为运行。
 */

import type { AgentType } from '../domain/model/AgentType';

export interface AgentCliSpec {
  /** 可执行文件路径或命令名 */
  exec: string;
  /** 固定参数（不含 --resume 和用户消息） */
  args: string[];
  /** 是否通过 stdin 发送用户消息 */
  stdin: boolean;
  /** 超时秒数；0 表示无超时 */
  timeoutSeconds: number;
}

export interface EnvEntry {
  key: string;
  label?: string;
  color?: string;
  prompt: string;
}

/**
 * 解析 JSON 格式的环境前缀列表（ENV: AGENT_ENV_PROMPTS_JSON）
 */
function parseEnvPrompts(raw?: string): EnvEntry[] {
  if (!raw || raw.trim() === '') return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e: unknown): e is EnvEntry =>
      typeof e === 'object' && e !== null && typeof (e as { key: unknown }).key === 'string' && typeof (e as { prompt: unknown }).prompt === 'string'
    );
  } catch {
    return [];
  }
}

const DEFAULT_CLAUDE_ARGS = [
  '--print',
  '--output-format', 'stream-json',
  '--verbose',
  '--include-partial-messages',
  '--dangerously-skip-permissions'
];

const DEFAULT_CODEX_ARGS = ['exec', '--skip-git-repo-check', '--full-auto'];

export class ChatConfig {
  readonly claude: AgentCliSpec;
  readonly codex: AgentCliSpec;
  readonly envEntries: EnvEntry[];
  readonly defaultWorkingDir: string;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.claude = {
      exec: env.CLAUDE_CLI_CMD || 'claude',
      args: env.CLAUDE_CLI_ARGS ? env.CLAUDE_CLI_ARGS.split(/\s+/).filter(Boolean) : DEFAULT_CLAUDE_ARGS,
      stdin: env.CLAUDE_CLI_STDIN !== 'false',
      timeoutSeconds: env.CLAUDE_CLI_TIMEOUT_SECONDS ? Number(env.CLAUDE_CLI_TIMEOUT_SECONDS) : 0
    };
    this.codex = {
      exec: env.CODEX_CLI_CMD || env.CODEX_CMD || 'codex',
      args: env.CODEX_CLI_ARGS ? env.CODEX_CLI_ARGS.split(/\s+/).filter(Boolean) : DEFAULT_CODEX_ARGS,
      stdin: env.CODEX_CLI_STDIN !== 'false',
      timeoutSeconds: env.CODEX_CLI_TIMEOUT_SECONDS ? Number(env.CODEX_CLI_TIMEOUT_SECONDS) : 0
    };
    this.envEntries = parseEnvPrompts(env.AGENT_ENV_PROMPTS_JSON);
    this.defaultWorkingDir = env.CHAT_DEFAULT_WORKING_DIR?.trim() || process.cwd();
  }

  getSpec(type: AgentType): AgentCliSpec {
    return type === 'claude' ? this.claude : this.codex;
  }

  findEnvEntry(key: string | undefined): EnvEntry | undefined {
    if (!key) return undefined;
    return this.envEntries.find(e => e.key === key.trim());
  }
}
