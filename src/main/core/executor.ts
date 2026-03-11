/**
 * 单步执行器
 *
 * 调用 Claude Agent SDK 执行单个步骤
 *
 * @author zhourui(V33215020)
 * @since 2026/03/11
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import log from 'electron-log';
import type { MergedConfig, StepResult, ValidationResult, McpServerConfig, StepEvent } from '../store/models';

type ClaudeCodeModule = typeof import('@anthropic-ai/claude-code');
let claudeCodeModule: ClaudeCodeModule | null = null;

/**
 * 动态导入 ESM 模块（绕过 TypeScript CommonJS 转换）
 *
 * @param modulePath 模块路径
 * @returns 导入的模块
 */
async function dynamicImport<T>(modulePath: string): Promise<T> {
  return new Function('modulePath', 'return import(modulePath)')(modulePath) as Promise<T>;
}

/**
 * 查找 Claude CLI 可执行文件路径
 *
 * Electron 从桌面启动时 PATH 不包含 ~/.local/bin，SDK 找不到 claude 命令。
 * 按优先级搜索已知安装路径，支持通过环境变量 CLAUDE_CODE_PATH 手动覆盖。
 *
 * @returns Claude CLI 路径，未找到则返回 undefined
 */
function findClaudeExecutable(): string | undefined {
  const envPath = process.env.CLAUDE_CODE_PATH;
  if (envPath && fs.existsSync(envPath)) {
    log.debug(`Using Claude CLI from CLAUDE_CODE_PATH: ${envPath}`);
    return envPath;
  }

  const homeDir = os.homedir();
  const isWindows = process.platform === 'win32';

  const candidates: string[] = isWindows
    ? [
        path.join(homeDir, '.local', 'bin', 'claude.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'claude-code', 'claude.exe')
      ]
    : [
        path.join(homeDir, '.local', 'bin', 'claude'),
        '/usr/local/bin/claude'
      ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      log.debug(`Found Claude CLI at: ${candidate}`);
      return candidate;
    }
  }

  log.debug('Claude CLI not found in known paths, relying on PATH');
  return undefined;
}

/**
 * 过滤无效的 MCP server 配置
 *
 * 数据库中存的 {"servers":[]} 等无效格式会导致 SDK schema 校验失败。
 * 只保留包含 command 字段的合法配置。
 *
 * @param mcpServers 原始 MCP 配置
 * @returns 过滤后的有效配置，全部无效时返回 undefined
 */
function getValidMcpServers(
  mcpServers?: Record<string, McpServerConfig>
): Record<string, { command: string; args?: string[]; env?: Record<string, string> }> | undefined {
  if (!mcpServers) {
    return undefined;
  }

  const validServers: Record<string, { command: string; args?: string[]; env?: Record<string, string> }> = {};

  for (const [name, config] of Object.entries(mcpServers)) {
    if (config && typeof config === 'object' && 'command' in config && config.command) {
      validServers[name] = {
        command: config.command,
        args: config.args,
        env: config.env
      };
    }
  }

  if (Object.keys(validServers).length === 0) {
    return undefined;
  }

  return validServers;
}

/**
 * 动态加载 Claude Code SDK（ESM 模块）
 *
 * @returns Claude Code 模块
 */
async function getClaudeCode(): Promise<ClaudeCodeModule> {
  if (!claudeCodeModule) {
    claudeCodeModule = await dynamicImport<ClaudeCodeModule>('@anthropic-ai/claude-code');
  }
  return claudeCodeModule;
}

/**
 * 从消息内容中提取文本
 *
 * @param content 消息内容
 * @returns 提取的文本
 */
function extractText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter((block): block is { type: string; text: string } =>
        typeof block === 'object' &&
        block !== null &&
        'type' in block &&
        block.type === 'text' &&
        'text' in block
      )
      .map(block => block.text)
      .join('');
  }

  return '';
}

/**
 * 截断字符串到指定长度
 *
 * @param str 原始字符串
 * @param maxLen 最大长度
 * @returns 截断后的字符串
 */
function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
}

/**
 * 从消息内容中提取工具结果
 *
 * @param content 消息内容
 * @param toolNameMap 工具ID到工具名的映射
 * @param turnIndex 当前轮次
 * @returns 工具结果事件列表
 */
function extractToolResults(
  content: unknown,
  toolNameMap: Map<string, string>,
  turnIndex: number
): StepEvent[] {
  const events: StepEvent[] = [];
  if (!Array.isArray(content)) return events;

  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue;
    if ('type' in block && block.type === 'tool_result' && 'tool_use_id' in block) {
      const toolUseId = block.tool_use_id as string;
      const toolName = toolNameMap.get(toolUseId) || 'unknown';
      let output = '';
      if (typeof block.content === 'string') {
        output = block.content;
      } else if (Array.isArray(block.content)) {
        output = block.content
          .filter((c: any) => c?.type === 'text')
          .map((c: any) => c.text)
          .join('\n');
      }
      events.push({
        type: 'tool_result',
        toolUseId,
        toolName,
        output: truncate(output, 2000),
        isError: !!block.is_error,
        turnIndex
      });
    }
  }
  return events;
}

/**
 * 执行单个步骤
 *
 * @param prompt 渲染后的提示词
 * @param config 合并后的配置
 * @param onEvent 流式事件回调
 * @returns 步骤执行结果
 */
export async function executeStep(
  prompt: string,
  config: MergedConfig,
  onEvent?: (event: StepEvent) => void
): Promise<StepResult> {
  let outputText = '';
  let tokensUsed = 0;
  let turnIndex = 0;
  const toolNameMap = new Map<string, string>();
  const stderrChunks: string[] = [];

  log.debug(`Executing step with prompt length: ${prompt.length}`);

  try {
    const { query } = await getClaudeCode();

    const claudePath = findClaudeExecutable();
    const validMcpServers = getValidMcpServers(config.mcpServers);

    const queryOptions: Parameters<typeof query>[0]['options'] = {
      customSystemPrompt: config.systemPrompt,
      allowedTools: config.allowedTools,
      mcpServers: validMcpServers,
      maxTurns: config.maxTurns || 30,
      permissionMode: 'acceptEdits',
      cwd: config.workingDirectory || process.cwd(),
      env: { CLAUDECODE: '' }
    };

    if (config.model) {
      queryOptions.model = config.model;
    }

    if (claudePath) {
      queryOptions.pathToClaudeCodeExecutable = claudePath;
    }

    queryOptions.stderr = (chunk: string) => {
      stderrChunks.push(chunk);
      log.debug(`Claude CLI stderr: ${chunk}`);
    };

    const q = query({
      prompt,
      options: queryOptions
    });

    for await (const msg of q) {
      // 1. 系统初始化消息
      if (msg.type === 'system' && 'subtype' in msg && msg.subtype === 'init') {
        const sysMsg = msg as any;
        onEvent?.({
          type: 'init',
          tools: sysMsg.tools || [],
          mcpServers: sysMsg.mcp_servers || [],
          model: sysMsg.model || ''
        });
      }

      // 2. Assistant 消息：包含 text 和 tool_use 内容块
      if (msg.type === 'assistant') {
        const content = (msg as any).message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (typeof block !== 'object' || block === null) continue;

            if (block.type === 'text' && block.text) {
              if (outputText) {
                outputText += '\n\n---\n\n';
              }
              outputText += block.text;
              onEvent?.({ type: 'text', text: block.text, turnIndex });
            }

            if (block.type === 'tool_use') {
              toolNameMap.set(block.id, block.name);
              onEvent?.({
                type: 'tool_call',
                toolUseId: block.id,
                toolName: block.name,
                input: block.input as Record<string, unknown>,
                turnIndex
              });
            }
          }
        } else {
          const text = extractText(content);
          if (text) {
            if (outputText) {
              outputText += '\n\n---\n\n';
            }
            outputText += text;
            onEvent?.({ type: 'text', text, turnIndex });
          }
        }

        onEvent?.({ type: 'turn_end', turnIndex });
        turnIndex++;
      }

      // 3. User 消息：包含 tool_result 内容块
      if (msg.type === 'user') {
        const content = (msg as any).message?.content;
        const toolResults = extractToolResults(content, toolNameMap, turnIndex);
        for (const event of toolResults) {
          onEvent?.(event);
        }
      }

      // 4. 最终结果
      if (msg.type === 'result') {
        const resultMsg = msg as any;
        const usage = resultMsg.usage;
        if (usage) {
          tokensUsed = (usage.input_tokens || 0) + (usage.output_tokens || 0);
        }
        onEvent?.({
          type: 'result',
          success: resultMsg.subtype === 'success',
          totalCostUsd: resultMsg.total_cost_usd || 0,
          durationMs: resultMsg.duration_ms || 0,
          numTurns: resultMsg.num_turns || 0,
          inputTokens: usage?.input_tokens || 0,
          outputTokens: usage?.output_tokens || 0
        });
        log.debug(`Step completed with ${tokensUsed} tokens`);
      }
    }

    return {
      success: true,
      outputText,
      tokensUsed
    };
  } catch (error) {
    let errorMessage = error instanceof Error ? error.message : String(error);

    if (stderrChunks.length > 0) {
      const stderrOutput = stderrChunks.join('').trim();
      if (stderrOutput) {
        errorMessage = `${errorMessage}\n\nCLI stderr:\n${stderrOutput}`;
      }
    }

    log.error('Step execution failed:', errorMessage);
    onEvent?.({ type: 'error', message: errorMessage });

    return {
      success: false,
      outputText,
      tokensUsed,
      errorMessage
    };
  }
}

/**
 * 带超时的步骤执行
 *
 * @param prompt 渲染后的提示词
 * @param config 合并后的配置
 * @param timeoutMs 超时时间（毫秒）
 * @param onProgress 进度回调
 * @returns 步骤执行结果
 */
export async function executeStepWithTimeout(
  prompt: string,
  config: MergedConfig,
  timeoutMs: number,
  onEvent?: (event: StepEvent) => void
): Promise<StepResult> {
  const timeoutPromise = new Promise<StepResult>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Step execution timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  const executionPromise = executeStep(prompt, config, onEvent);

  try {
    return await Promise.race([executionPromise, timeoutPromise]);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      outputText: '',
      tokensUsed: 0,
      errorMessage
    };
  }
}

/**
 * 验证步骤输出
 *
 * 将步骤输出和验证提示词交给 Claude Agent SDK，判断输出是否符合预期。
 * LLM 需回答 PASS 或 FAIL 开头，后续行为理由说明。
 *
 * @param outputText 步骤输出文本
 * @param validationPrompt 验证提示词
 * @param config 合并后的配置
 * @returns 验证结果
 */
export async function validateStepOutput(
  outputText: string,
  validationPrompt: string,
  config: MergedConfig
): Promise<ValidationResult> {
  const prompt = `请验证以下输出是否符合要求。

## 验证规则
${validationPrompt}

## 待验证的输出
${outputText}

## 回答格式
第一行必须是 PASS 或 FAIL，后续行说明理由。`;

  const validationConfig: MergedConfig = {
    ...config,
    maxTurns: 1
  };

  const result = await executeStep(prompt, validationConfig);
  const passed = result.outputText.trim().toUpperCase().startsWith('PASS');

  return {
    passed,
    output: result.outputText,
    tokensUsed: result.tokensUsed
  };
}
