/**
 * IPC 输入校验测试
 *
 * @author zhourui(V33215020)
 * @since 2026/03/14
 */

import { describe, it, expect } from 'vitest';
import {
  IdSchema,
  CreateWorkflowSchema,
  UpdateWorkflowSchema,
  ExecutionListParamsSchema,
  CreateSkillSchema,
  UpdateConfigSchema,
  RunWorkflowInputsSchema,
  validateInput
} from '../src/main/shared/interface/schemas';

describe('IdSchema', () => {
  it('should accept non-empty string', () => {
    expect(validateInput(IdSchema, 'abc-123')).toBe('abc-123');
  });

  it('should reject empty string', () => {
    expect(() => validateInput(IdSchema, '')).toThrow('输入校验失败');
  });

  it('should reject non-string', () => {
    expect(() => validateInput(IdSchema, 123)).toThrow();
  });

  it('should reject undefined', () => {
    expect(() => validateInput(IdSchema, undefined)).toThrow();
  });
});

describe('CreateWorkflowSchema', () => {
  const validWorkflow = {
    name: 'Test Workflow',
    steps: [{ name: 'Step 1', prompt: 'Do something' }]
  };

  it('should accept minimal valid workflow', () => {
    const result = validateInput(CreateWorkflowSchema, validWorkflow);
    expect(result.name).toBe('Test Workflow');
    expect(result.steps).toHaveLength(1);
  });

  it('should accept full workflow with all fields', () => {
    const full = {
      ...validWorkflow,
      enabled: true,
      schedule: '0 9 * * 1-5',
      rules: 'some rules',
      onFailure: 'retry' as const,
      limits: { maxTokens: 10000 },
      workingDirectory: '/tmp',
      steps: [{
        name: 'Step 1',
        prompt: 'Do something',
        model: 'claude-3',
        maxTurns: 10,
        onFailure: 'retry' as const,
        retryConfig: { maxAttempts: 3, delayMs: 1000 },
        validation: { prompt: 'Validate output' },
        skillIds: ['id2']
      }]
    };
    const result = validateInput(CreateWorkflowSchema, full);
    expect(result.onFailure).toBe('retry');
    expect(result.steps[0].retryConfig?.maxAttempts).toBe(3);
  });

  it('should reject workflow without name', () => {
    expect(() => validateInput(CreateWorkflowSchema, { steps: [{ name: 's', prompt: 'p' }] }))
      .toThrow();
  });

  it('should reject workflow without steps', () => {
    expect(() => validateInput(CreateWorkflowSchema, { name: 'Test' }))
      .toThrow();
  });

  it('should reject workflow with empty steps array', () => {
    expect(() => validateInput(CreateWorkflowSchema, { name: 'Test', steps: [] }))
      .toThrow('至少需要一个步骤');
  });

  it('should reject step without prompt', () => {
    expect(() => validateInput(CreateWorkflowSchema, {
      name: 'Test',
      steps: [{ name: 'Step 1' }]
    })).toThrow();
  });

  it('should reject invalid onFailure value', () => {
    expect(() => validateInput(CreateWorkflowSchema, {
      ...validWorkflow,
      onFailure: 'crash'
    })).toThrow();
  });

  it('should reject retryConfig with maxAttempts > 10', () => {
    expect(() => validateInput(CreateWorkflowSchema, {
      name: 'Test',
      steps: [{
        name: 'Step 1',
        prompt: 'Do something',
        retryConfig: { maxAttempts: 100 }
      }]
    })).toThrow();
  });
});

describe('UpdateWorkflowSchema', () => {
  it('should accept partial updates', () => {
    const result = validateInput(UpdateWorkflowSchema, { name: 'Updated' });
    expect(result.name).toBe('Updated');
  });

  it('should accept empty object', () => {
    const result = validateInput(UpdateWorkflowSchema, {});
    expect(result).toEqual({});
  });

  it('should accept limits: null (frontend sends null for empty limits)', () => {
    const result = validateInput(UpdateWorkflowSchema, {
      name: 'Test',
      limits: null
    });
    expect(result.name).toBe('Test');
  });

  it('should accept output: null (frontend sends null for empty output)', () => {
    const result = validateInput(UpdateWorkflowSchema, {
      name: 'Test',
      output: null
    });
    expect(result.name).toBe('Test');
  });
});

describe('ExecutionListParamsSchema', () => {
  it('should accept valid params', () => {
    const result = validateInput(ExecutionListParamsSchema, {
      workflowId: 'abc',
      status: 'running',
      limit: 20,
      offset: 0
    });
    expect(result?.status).toBe('running');
  });

  it('should accept undefined', () => {
    const result = validateInput(ExecutionListParamsSchema, undefined);
    expect(result).toBeUndefined();
  });

  it('should reject invalid status', () => {
    expect(() => validateInput(ExecutionListParamsSchema, { status: 'broken' }))
      .toThrow();
  });

  it('should reject negative limit', () => {
    expect(() => validateInput(ExecutionListParamsSchema, { limit: -1 }))
      .toThrow();
  });

  it('should reject limit over 1000', () => {
    expect(() => validateInput(ExecutionListParamsSchema, { limit: 5000 }))
      .toThrow();
  });
});

describe('CreateSkillSchema', () => {
  it('should accept valid skill', () => {
    const result = validateInput(CreateSkillSchema, {
      name: 'test-skill',
      content: '# My Skill\nDo stuff'
    });
    expect(result.name).toBe('test-skill');
  });

  it('should reject without content', () => {
    expect(() => validateInput(CreateSkillSchema, { name: 'test' }))
      .toThrow();
  });

  it('should accept with allowed tools', () => {
    const result = validateInput(CreateSkillSchema, {
      name: 'test-skill',
      content: 'content',
      allowedTools: ['Bash', 'Read']
    });
    expect(result.allowedTools).toEqual(['Bash', 'Read']);
  });
});

describe('UpdateConfigSchema', () => {
  it('should accept partial config', () => {
    const result = validateInput(UpdateConfigSchema, { systemPrompt: 'New prompt' });
    expect(result.systemPrompt).toBe('New prompt');
  });

  it('should accept empty object', () => {
    const result = validateInput(UpdateConfigSchema, {});
    expect(result).toEqual({});
  });
});

describe('RunWorkflowInputsSchema', () => {
  it('should accept record of unknown values', () => {
    const result = validateInput(RunWorkflowInputsSchema, { key: 'value', num: 42 });
    expect(result).toEqual({ key: 'value', num: 42 });
  });

  it('should accept undefined', () => {
    const result = validateInput(RunWorkflowInputsSchema, undefined);
    expect(result).toBeUndefined();
  });
});

describe('validateInput error messages', () => {
  it('should include field path in error message', () => {
    expect(() => validateInput(CreateWorkflowSchema, { name: '', steps: [{ name: '', prompt: '' }] }))
      .toThrow('输入校验失败');
  });
});
