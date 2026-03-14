/**
 * 输出处理器
 *
 * 支持:
 * - 文件输出
 * - Webhook通知
 *
 * @author zhourui(V33215020)
 * @since 2026/03/11
 */

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import log from 'electron-log';
import type { WorkflowOutput, ExecutionResult } from '../store/models';
import { renderTemplate } from './template';

/**
 * 处理工作流输出
 *
 * @param output 输出配置
 * @param result 执行结果
 * @param context 模板上下文
 */
export async function handleOutput(
  output: WorkflowOutput | undefined,
  result: ExecutionResult,
  context: Record<string, unknown>
): Promise<void> {
  if (!output) {
    return;
  }

  const promises: Promise<void>[] = [];

  if (output.file) {
    promises.push(writeOutputFile(output.file, result, context));
  }

  if (output.webhook) {
    promises.push(sendWebhook(output.webhook, result));
  }

  await Promise.allSettled(promises);
}

/**
 * 写入输出文件
 *
 * @param fileConfig 文件配置
 * @param result 执行结果
 * @param context 模板上下文
 */
async function writeOutputFile(
  fileConfig: NonNullable<WorkflowOutput['file']>,
  result: ExecutionResult,
  context: Record<string, unknown>
): Promise<void> {
  try {
    const filePath = renderTemplate(fileConfig.path, { inputs: context });
    const format = fileConfig.format || 'text';

    const dirPath = path.dirname(filePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    let content: string;
    switch (format) {
      case 'json':
        content = JSON.stringify(result.outputs, null, 2);
        break;
      case 'markdown':
        content = formatAsMarkdown(result);
        break;
      default:
        content = formatAsText(result);
    }

    fs.writeFileSync(filePath, content, 'utf-8');
    log.info(`Output written to file: ${filePath}`);
  } catch (error) {
    log.error('Failed to write output file:', error);
    throw error;
  }
}

/**
 * 格式化为纯文本
 *
 * @param result 执行结果
 * @returns 格式化后的文本
 */
function formatAsText(result: ExecutionResult): string {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(result.outputs)) {
    if (key.startsWith('steps.') && key.endsWith('.output')) {
      const stepName = key.replace('steps.', '').replace('.output', '');
      lines.push(`=== ${stepName} ===`);
      lines.push(String(value));
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * 格式化为Markdown
 *
 * @param result 执行结果
 * @returns 格式化后的Markdown
 */
function formatAsMarkdown(result: ExecutionResult): string {
  const lines: string[] = [];
  lines.push('# Workflow Execution Result');
  lines.push('');
  lines.push(`- **Success**: ${result.success}`);
  lines.push(`- **Total Tokens**: ${result.totalTokens}`);
  lines.push('');

  for (const [key, value] of Object.entries(result.outputs)) {
    if (key.startsWith('steps.') && key.endsWith('.output')) {
      const stepName = key.replace('steps.', '').replace('.output', '');
      lines.push(`## ${stepName}`);
      lines.push('');
      lines.push(String(value));
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * 校验 Webhook URL，仅允许 http/https 协议
 *
 * @param url 待校验 URL
 */
function validateWebhookUrl(url: string): void {
  const parsed = new URL(url);
  const allowedProtocols = ['http:', 'https:'];
  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new Error(`Webhook URL 协议不允许: ${parsed.protocol}，仅支持 http/https`);
  }
}

/**
 * 发送Webhook通知
 *
 * @param webhookConfig Webhook配置
 * @param result 执行结果
 */
async function sendWebhook(
  webhookConfig: NonNullable<WorkflowOutput['webhook']>,
  result: ExecutionResult
): Promise<void> {
  try {
    validateWebhookUrl(webhookConfig.url);
    const method = webhookConfig.method || 'POST';
    const headers = {
      'Content-Type': 'application/json',
      ...webhookConfig.headers
    };

    const payload = {
      success: result.success,
      totalTokens: result.totalTokens,
      outputs: result.outputs,
      errorMessage: result.errorMessage,
      timestamp: new Date().toISOString()
    };

    await axios({
      method,
      url: webhookConfig.url,
      headers,
      data: payload,
      timeout: webhookConfig.timeoutMs || 30000
    });

    log.info(`Webhook sent to: ${webhookConfig.url}`);
  } catch (error) {
    log.error('Failed to send webhook:', error);
    throw error;
  }
}
