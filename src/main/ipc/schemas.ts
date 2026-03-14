/**
 * IPC 输入校验 Schemas
 *
 * 基于 Zod 对所有 IPC channel 入参进行运行时校验
 *
 * @author zhourui(V33215020)
 * @since 2026/03/14
 */

import { z } from 'zod';

// ========== 通用 ==========

export const IdSchema = z.string().min(1, 'ID 不能为空');

// ========== 工作流 ==========

const StepSchema = z.object({
  name: z.string().min(1, '步骤名称不能为空'),
  prompt: z.string().min(1, '步骤提示词不能为空'),
  model: z.string().optional(),
  maxTurns: z.number().int().positive().optional(),
  onFailure: z.enum(['stop', 'skip', 'retry']).optional(),
  retryConfig: z.object({
    maxAttempts: z.number().int().min(1).max(10).optional(),
    delayMs: z.number().int().min(100).max(60000).optional()
  }).optional(),
  validation: z.object({
    prompt: z.string().min(1)
  }).optional(),
  mcpServerIds: z.array(z.string()).optional(),
  skillIds: z.array(z.string()).optional()
});

const McpServerConfigSchema = z.record(z.string(), z.object({
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional()
}));

const LimitsSchema = z.object({
  maxTokens: z.number().int().positive().optional(),
  maxTurns: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().optional()
}).optional();

const OutputSchema = z.object({
  file: z.object({
    path: z.string().min(1),
    format: z.enum(['text', 'json', 'markdown']).optional()
  }).optional(),
  webhook: z.object({
    url: z.string().url(),
    method: z.enum(['POST', 'PUT']).optional(),
    headers: z.record(z.string(), z.string()).optional(),
    timeoutMs: z.number().int().positive().optional()
  }).optional()
}).optional();

export const CreateWorkflowSchema = z.object({
  name: z.string().min(1, '工作流名称不能为空').max(200),
  enabled: z.boolean().optional(),
  schedule: z.string().optional(),
  inputs: z.array(z.object({
    name: z.string().min(1),
    type: z.enum(['string', 'number', 'boolean']),
    required: z.boolean().optional(),
    default: z.union([z.string(), z.number(), z.boolean()]).optional(),
    description: z.string().optional()
  })).optional(),
  steps: z.array(StepSchema).min(1, '至少需要一个步骤'),
  rules: z.string().optional(),
  mcpServers: McpServerConfigSchema.optional(),
  skills: z.record(z.string(), z.string()).optional(),
  limits: LimitsSchema,
  output: OutputSchema,
  workingDirectory: z.string().optional(),
  onFailure: z.enum(['stop', 'skip', 'retry']).optional()
});

export const UpdateWorkflowSchema = CreateWorkflowSchema.partial();

export const RunWorkflowInputsSchema = z.record(z.string(), z.unknown()).optional();

// ========== 执行记录 ==========

export const ExecutionListParamsSchema = z.object({
  workflowId: z.string().optional(),
  status: z.enum(['pending', 'running', 'success', 'failed']).optional(),
  limit: z.number().int().positive().max(1000).optional(),
  offset: z.number().int().min(0).optional()
}).optional();

// ========== MCP 服务 ==========

export const CreateMcpServerSchema = z.object({
  name: z.string().min(1, 'MCP 服务名称不能为空').max(200),
  description: z.string().optional(),
  command: z.string().min(1, '命令不能为空'),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().optional()
});

export const UpdateMcpServerSchema = CreateMcpServerSchema.partial();

// ========== Skills ==========

export const CreateSkillSchema = z.object({
  name: z.string().min(1, 'Skill 名称不能为空').max(200),
  description: z.string().optional(),
  allowedTools: z.array(z.string()).optional(),
  content: z.string().min(1, 'Skill 内容不能为空'),
  enabled: z.boolean().optional()
});

export const UpdateSkillSchema = CreateSkillSchema.partial();

// ========== 全局配置 ==========

export const UpdateConfigSchema = z.object({
  systemPrompt: z.string().optional(),
  defaultModel: z.string().optional(),
  mcpServers: McpServerConfigSchema.optional()
});

// ========== 校验辅助函数 ==========

/**
 * 校验 IPC 输入，失败时抛出描述性错误
 *
 * @param schema Zod schema
 * @param data 待校验数据
 * @returns 校验通过的数据
 */
export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const messages = result.error.issues
      .map(issue => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`输入校验失败: ${messages}`);
  }
  return result.data;
}
