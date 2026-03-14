/**
 * 输出处理器
 *
 * 实现 OutputProcessor 接口，支持文件输出和 Webhook 通知。
 *
 * @author zhourui
 * @since 2026/03/14
 */

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import log from 'electron-log';
import type { OutputProcessor } from '../domain/service/PipelineOrchestrator';
import type { WorkflowOutput } from '../../workflow/domain/model';
import type { ExecutionResult } from '../domain/model/ExecutionResult';

/**
 * 简单模板渲染（仅处理 {{inputs.xxx}} 变量）
 *
 * 内联实现，避免跨上下文依赖 TemplateEngine。
 */
function renderSimpleTemplate(template: string, context: { inputs: Record<string, unknown> }): string {
  return template.replace(/\{\{(\s*[\w.]+\s*)\}\}/g, (match, variableName: string) => {
    const trimmedName = variableName.trim();

    const parts = trimmedName.split('.');
    let current: unknown = context;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return match;
      }
      current = (current as Record<string, unknown>)[part];
    }

    if (current === undefined || current === null) {
      return match;
    }

    if (typeof current === 'object') {
      return JSON.stringify(current);
    }

    return String(current);
  });
}

/**
 * 格式化为纯文本
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
 * 格式化为 Markdown
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
 */
function validateWebhookUrl(url: string): void {
  const parsed = new URL(url);
  const allowedProtocols = ['http:', 'https:'];
  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new Error(`Webhook URL 协议不允许: ${parsed.protocol}，仅支持 http/https`);
  }
}

/**
 * 写入输出文件
 */
async function writeOutputFile(
  fileConfig: NonNullable<WorkflowOutput['file']>,
  result: ExecutionResult,
  context: Record<string, unknown>
): Promise<void> {
  try {
    const filePath = renderSimpleTemplate(fileConfig.path, { inputs: context });
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
 * 发送 Webhook 通知
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

export class OutputHandler implements OutputProcessor {
  /**
   * 处理工作流输出
   */
  async process(
    output: WorkflowOutput | undefined,
    result: ExecutionResult,
    inputs: Record<string, unknown>
  ): Promise<void> {
    if (!output) {
      return;
    }

    const promises: Promise<void>[] = [];

    if (output.file) {
      promises.push(writeOutputFile(output.file, result, inputs));
    }

    if (output.webhook) {
      promises.push(sendWebhook(output.webhook, result));
    }

    await Promise.allSettled(promises);
  }
}
