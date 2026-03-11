/**
 * 单步执行器
 *
 * 调用 Claude Agent SDK 执行单个步骤
 *
 * @author zhourui(V33215020)
 * @since 2026/03/11
 */

import { query } from '@anthropic-ai/claude-code';
import log from 'electron-log';
import type { MergedConfig, StepResult } from '../store/models';

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
 * 执行单个步骤
 *
 * @param prompt 渲染后的提示词
 * @param config 合并后的配置
 * @param onProgress 进度回调
 * @returns 步骤执行结果
 */
export async function executeStep(
  prompt: string,
  config: MergedConfig,
  onProgress?: (text: string) => void
): Promise<StepResult> {
  let outputText = '';
  let tokensUsed = 0;

  log.debug(`Executing step with prompt length: ${prompt.length}`);

  try {
    const q = query({
      prompt,
      options: {
        model: config.model || 'claude-sonnet-4-20250514',
        customSystemPrompt: config.systemPrompt,
        allowedTools: config.allowedTools,
        mcpServers: config.mcpServers as Record<string, import('@anthropic-ai/claude-code').McpServerConfig> | undefined,
        maxTurns: config.maxTurns || 30,
        permissionMode: 'acceptEdits',
        cwd: process.cwd()
      }
    });

    for await (const msg of q) {
      if (msg.type === 'assistant') {
        const text = extractText(msg.message?.content);
        if (text) {
          outputText += text;
          onProgress?.(text);
        }
      }

      if (msg.type === 'result') {
        const usage = (msg as { usage?: { total_tokens?: number } }).usage;
        tokensUsed = usage?.total_tokens || 0;
        log.debug(`Step completed with ${tokensUsed} tokens`);
      }
    }

    return {
      success: true,
      outputText,
      tokensUsed
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error('Step execution failed:', errorMessage);

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
  onProgress?: (text: string) => void
): Promise<StepResult> {
  const timeoutPromise = new Promise<StepResult>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Step execution timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  const executionPromise = executeStep(prompt, config, onProgress);

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
