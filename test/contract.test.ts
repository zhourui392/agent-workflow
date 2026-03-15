/**
 * 契约测试
 *
 * 验证 Zod Schema（后端期望）与前端映射函数（前端产出）之间的字段对齐。
 * 当后端 Schema 新增字段但前端映射未同步时，测试自动失败并报出缺失字段名。
 */

import { describe, it, expect } from 'vitest';
import { dataToCreateRequest } from '../src/renderer/api/workflows';
import {
  CreateWorkflowSchema,
  ExecutionListParamsSchema
} from '../src/main/shared/interface/schemas';
import type { WorkflowData } from '../src/renderer/api/workflows';

// ========== 辅助函数 ==========

/** 构造一个包含所有字段的完整表单数据 */
function createFullFormData(): Partial<WorkflowData> {
  return {
    name: 'Contract Test Workflow',
    enabled: true,
    schedule: '0 9 * * *',
    inputs: {
      items: [
        { name: 'env', type: 'string', required: true, description: 'Environment' }
      ]
    },
    steps: [{
      name: 'Step 1',
      prompt: 'Do task',
      model: 'claude-sonnet-4-20250514',
      max_turns: 5,
      onFailure: 'retry' as const,
      retryConfig: { maxAttempts: 3, delayMs: 1000 },
      validation_prompt: 'Check output',
      validation_rules: [{ type: 'contains' as const, value: 'success' }],
      skill_ids: ['skill-001']
    }],
    rules: 'Always use TypeScript',
    skills: { 'my-skill': 'content' },
    limits: { maxTokens: 10000 },
    output: { file: { path: '/tmp/out.json' } },
    working_directory: '/home/user/project',
    on_failure: 'stop',
    retry_config: { maxAttempts: 2, delayMs: 500 }
  };
}

// ========== Schema → Adapter 字段对齐 ==========

describe('Contract: CreateWorkflowSchema ↔ dataToCreateRequest', () => {
  it('dataToCreateRequest 输出覆盖 Schema 所有顶级字段', () => {
    const schemaKeys = Object.keys(CreateWorkflowSchema.shape).sort();
    const request = dataToCreateRequest(createFullFormData());
    const requestKeys = Object.keys(request).sort();

    const missingInRequest = schemaKeys.filter(k => !requestKeys.includes(k));

    expect(
      missingInRequest,
      `Schema 有以下字段但 dataToCreateRequest 未产出: ${missingInRequest.join(', ')}`
    ).toEqual([]);
  });

  it('dataToCreateRequest 不产出 Schema 不认识的字段', () => {
    const schemaKeys = Object.keys(CreateWorkflowSchema.shape);
    const request = dataToCreateRequest(createFullFormData());
    const requestKeys = Object.keys(request);

    const extraInRequest = requestKeys.filter(k => !schemaKeys.includes(k));

    expect(
      extraInRequest,
      `dataToCreateRequest 产出了 Schema 不认识的字段: ${extraInRequest.join(', ')}`
    ).toEqual([]);
  });
});

// ========== Adapter 输出可通过 Schema 校验 ==========

describe('Contract: dataToCreateRequest 输出通过 Zod 校验', () => {
  it('完整 agent 步骤通过校验', () => {
    const request = dataToCreateRequest(createFullFormData());
    const result = CreateWorkflowSchema.safeParse(request);

    if (!result.success) {
      const messages = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
      expect.fail(`Schema 校验失败:\n${messages.join('\n')}`);
    }
  });

  it('最小 agent 步骤通过校验', () => {
    const request = dataToCreateRequest({
      name: 'Minimal',
      steps: [{ name: 'S1', prompt: 'P1' }]
    });
    const result = CreateWorkflowSchema.safeParse(request);

    if (!result.success) {
      const messages = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
      expect.fail(`Schema 校验失败:\n${messages.join('\n')}`);
    }
  });

  it('subWorkflow 步骤通过校验', () => {
    const request = dataToCreateRequest({
      name: 'SubWF Test',
      steps: [{
        type: 'subWorkflow',
        name: 'Sub',
        workflowId: 'wf-sub-001',
        inputMapping: { env: '{{inputs.env}}' }
      } as any]
    });
    const result = CreateWorkflowSchema.safeParse(request);

    if (!result.success) {
      const messages = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
      expect.fail(`Schema 校验失败:\n${messages.join('\n')}`);
    }
  });

  it('forEach 步骤通过校验', () => {
    const request = dataToCreateRequest({
      name: 'ForEach Test',
      steps: [{
        type: 'forEach',
        name: 'Loop',
        prompt: 'Process {{item}}',
        iterateOver: '{{steps.prev.output}}',
        itemVariable: 'item'
      } as any]
    });
    const result = CreateWorkflowSchema.safeParse(request);

    if (!result.success) {
      const messages = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
      expect.fail(`Schema 校验失败:\n${messages.join('\n')}`);
    }
  });

  it('dataSplit 步骤通过校验', () => {
    const request = dataToCreateRequest({
      name: 'DataSplit Test',
      steps: [{
        type: 'dataSplit',
        name: 'Split',
        mode: 'static',
        staticData: '["a","b","c"]'
      } as any]
    });
    const result = CreateWorkflowSchema.safeParse(request);

    if (!result.success) {
      const messages = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
      expect.fail(`Schema 校验失败:\n${messages.join('\n')}`);
    }
  });

  it('null schedule 归一化后通过校验', () => {
    const request = dataToCreateRequest({
      name: 'Null Schedule',
      schedule: null,
      steps: [{ name: 'S1', prompt: 'P1' }]
    });
    const result = CreateWorkflowSchema.safeParse(request);

    if (!result.success) {
      const messages = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
      expect.fail(`Schema 校验失败:\n${messages.join('\n')}`);
    }
    // null 应被转为 undefined，不出现在输出中
    expect(result.data!.schedule).toBeUndefined();
  });

  it('null limits 归一化后通过校验', () => {
    const request = dataToCreateRequest({
      name: 'Null Limits',
      limits: null,
      steps: [{ name: 'S1', prompt: 'P1' }]
    });
    const result = CreateWorkflowSchema.safeParse(request);

    if (!result.success) {
      const messages = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
      expect.fail(`Schema 校验失败:\n${messages.join('\n')}`);
    }
  });

  it('空 validation 字段不生成非法嵌套对象', () => {
    const request = dataToCreateRequest({
      name: 'Empty Validation',
      steps: [{ name: 'S1', prompt: 'P1', validation_prompt: '', validation_rules: [] }]
    });
    const result = CreateWorkflowSchema.safeParse(request);

    if (!result.success) {
      const messages = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
      expect.fail(`Schema 校验失败:\n${messages.join('\n')}`);
    }
  });
});

// ========== ExecutionListParams 契约 ==========

describe('Contract: ExecutionListParamsSchema', () => {
  it('前端参数映射覆盖 Schema 所有字段', () => {
    // ExecutionListParamsSchema 是 optional，取其 inner shape
    const innerSchema = ExecutionListParamsSchema!;
    const shape = (innerSchema as any)._def?.innerType?.shape ?? (innerSchema as any).shape;

    if (shape) {
      const schemaKeys = Object.keys(shape).sort();
      // 前端 listExecutions 映射的字段
      const mappedKeys = ['workflowId', 'status', 'limit', 'offset'].sort();

      const missing = schemaKeys.filter(k => !mappedKeys.includes(k));
      expect(
        missing,
        `ExecutionListParamsSchema 有字段但前端未映射: ${missing.join(', ')}`
      ).toEqual([]);
    }
  });
});
