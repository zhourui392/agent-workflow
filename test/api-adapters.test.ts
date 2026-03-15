/**
 * API 适配层测试
 *
 * 验证 DTO ↔ 表单数据的双向映射：字段名转换、嵌套/拆平、null/undefined 归一化
 */

import { describe, it, expect } from 'vitest';
import { workflowToData, dataToCreateRequest } from '../src/renderer/api/workflows';
import { executionToData, stepExecutionToData } from '../src/renderer/api/executions';
import type { WorkflowDTO, ExecutionDTO, StepExecutionDTO } from '../src/main/types';

// ========== 工厂函数 ==========

function createFullWorkflowDTO(overrides?: Partial<WorkflowDTO>): WorkflowDTO {
  return {
    id: 'wf-001',
    name: 'Test Workflow',
    enabled: true,
    schedule: '0 9 * * *',
    inputs: [
      { name: 'env', type: 'string', required: true, description: 'Target environment' }
    ],
    steps: [
      {
        name: 'Step 1',
        prompt: 'Do task 1',
        model: 'claude-sonnet-4-20250514',
        maxTurns: 5,
        onFailure: 'retry' as const,
        retryConfig: { maxAttempts: 3, delayMs: 1000 },
        validation: {
          prompt: 'Check output',
          rules: [{ type: 'contains' as const, value: 'success' }]
        },
        skillIds: ['skill-001', 'skill-002']
      }
    ],
    rules: 'Always use TypeScript',
    skills: { 'my-skill': 'skill content' },
    limits: { maxTurns: 20, timeoutMs: 60000 },
    output: {
      file: { path: '/tmp/out.json', format: 'json' },
      webhook: { url: 'https://example.com/hook', method: 'POST' }
    },
    workingDirectory: '/home/user/project',
    onFailure: 'stop' as const,
    retryConfig: { maxAttempts: 2, delayMs: 500 },
    createdAt: '2026-03-14T00:00:00Z',
    updatedAt: '2026-03-14T12:00:00Z',
    ...overrides
  };
}

function createFullExecutionDTO(overrides?: Partial<ExecutionDTO>): ExecutionDTO {
  return {
    id: 'exec-001',
    workflowId: 'wf-001',
    workflowName: 'Test Workflow',
    triggerType: 'manual' as const,
    status: 'success' as const,
    startedAt: '2026-03-14T00:00:00Z',
    finishedAt: '2026-03-14T00:05:00Z',
    currentStep: 2,
    totalSteps: 2,
    totalTokens: 5000,
    errorMessage: undefined,
    stepExecutions: [
      {
        id: 'se-001',
        executionId: 'exec-001',
        stepIndex: 0,
        stepName: 'Step 1',
        status: 'success' as const,
        startedAt: '2026-03-14T00:00:00Z',
        finishedAt: '2026-03-14T00:02:00Z',
        promptRendered: 'Do task 1',
        outputText: 'Task 1 done',
        tokensUsed: 2500,
        modelUsed: 'claude-sonnet-4-20250514',
        errorMessage: undefined,
        validationStatus: 'passed' as const,
        validationOutput: 'OK',
        events: [{ type: 'text' as const, text: 'hello' }]
      }
    ],
    parentExecutionId: undefined,
    parentStepIndex: undefined,
    iterationIndex: undefined,
    ...overrides
  };
}

// ========== workflowToData ==========

describe('workflowToData', () => {
  it('全字段映射：camelCase → snake_case', () => {
    const dto = createFullWorkflowDTO();
    const data = workflowToData(dto);

    expect(data.id).toBe('wf-001');
    expect(data.name).toBe('Test Workflow');
    expect(data.enabled).toBe(true);
    expect(data.schedule).toBe('0 9 * * *');
    expect(data.rules).toBe('Always use TypeScript');
    expect(data.skills).toEqual({ 'my-skill': 'skill content' });
    expect(data.limits).toEqual({ maxTurns: 20, timeoutMs: 60000 });
    expect(data.output).toEqual({
      file: { path: '/tmp/out.json', format: 'json' },
      webhook: { url: 'https://example.com/hook', method: 'POST' }
    });
    expect(data.working_directory).toBe('/home/user/project');
    expect(data.on_failure).toBe('stop');
    expect(data.retry_config).toEqual({ maxAttempts: 2, delayMs: 500 });
    expect(data.created_at).toBe('2026-03-14T00:00:00Z');
    expect(data.updated_at).toBe('2026-03-14T12:00:00Z');
  });

  it('inputs 包装为 { items: [...] }', () => {
    const dto = createFullWorkflowDTO();
    const data = workflowToData(dto);

    expect(data.inputs).toEqual({
      items: [{ name: 'env', type: 'string', required: true, description: 'Target environment' }]
    });
  });

  it('无 inputs 时返回 undefined', () => {
    const dto = createFullWorkflowDTO({ inputs: undefined });
    const data = workflowToData(dto);

    expect(data.inputs).toBeUndefined();
  });

  it('agent 步骤字段转换：validation 拆解为 flat 字段', () => {
    const dto = createFullWorkflowDTO();
    const data = workflowToData(dto);
    const step = data.steps[0];

    expect(step.name).toBe('Step 1');
    expect(step.prompt).toBe('Do task 1');
    expect(step.model).toBe('claude-sonnet-4-20250514');
    expect(step.max_turns).toBe(5);
    expect(step.onFailure).toBe('retry');
    expect(step.retryConfig).toEqual({ maxAttempts: 3, delayMs: 1000 });
    expect(step.validation_prompt).toBe('Check output');
    expect(step.validation_rules).toEqual([{ type: 'contains', value: 'success' }]);
    expect(step.skill_ids).toEqual(['skill-001', 'skill-002']);
  });

  it('agent 步骤：无 validation 时返回空字符串和空数组', () => {
    const dto = createFullWorkflowDTO({
      steps: [{ name: 'S1', prompt: 'P1' }]
    });
    const data = workflowToData(dto);
    const step = data.steps[0];

    expect(step.validation_prompt).toBe('');
    expect(step.validation_rules).toEqual([]);
  });

  it('subWorkflow 步骤透传不转换', () => {
    const subStep = {
      type: 'subWorkflow' as const,
      name: 'Sub Step',
      workflowId: 'wf-sub',
      inputMapping: { key: 'value' },
      onFailure: 'skip' as const
    };
    const dto = createFullWorkflowDTO({ steps: [subStep as any] });
    const data = workflowToData(dto);

    expect((data.steps[0] as any).type).toBe('subWorkflow');
    expect((data.steps[0] as any).workflowId).toBe('wf-sub');
    expect((data.steps[0] as any).inputMapping).toEqual({ key: 'value' });
  });

  it('forEach 步骤透传不转换', () => {
    const forEachStep = {
      type: 'forEach' as const,
      name: 'ForEach Step',
      prompt: 'Process {{item}}',
      iterateOver: '{{steps.prev.output}}',
      itemVariable: 'item'
    };
    const dto = createFullWorkflowDTO({ steps: [forEachStep as any] });
    const data = workflowToData(dto);

    expect((data.steps[0] as any).type).toBe('forEach');
    expect((data.steps[0] as any).iterateOver).toBe('{{steps.prev.output}}');
  });

  it('dataSplit 步骤透传不转换', () => {
    const dataSplitStep = {
      type: 'dataSplit' as const,
      name: 'Split Step',
      mode: 'static' as const,
      staticData: '["a","b","c"]'
    };
    const dto = createFullWorkflowDTO({ steps: [dataSplitStep as any] });
    const data = workflowToData(dto);

    expect((data.steps[0] as any).type).toBe('dataSplit');
    expect((data.steps[0] as any).mode).toBe('static');
  });

  it('schedule 为 undefined 时归一化为 null', () => {
    const dto = createFullWorkflowDTO({ schedule: undefined });
    const data = workflowToData(dto);

    expect(data.schedule).toBeNull();
  });

  it('rules 为 undefined 时归一化为 null', () => {
    const dto = createFullWorkflowDTO({ rules: undefined });
    const data = workflowToData(dto);

    expect(data.rules).toBeNull();
  });

  it('workingDirectory 为 undefined 时归一化为 null', () => {
    const dto = createFullWorkflowDTO({ workingDirectory: undefined });
    const data = workflowToData(dto);

    expect(data.working_directory).toBeNull();
  });

  it('retryConfig 为 undefined 时归一化为 null', () => {
    const dto = createFullWorkflowDTO({ retryConfig: undefined });
    const data = workflowToData(dto);

    expect(data.retry_config).toBeNull();
  });

  it('混合步骤类型：同一工作流含 agent + subWorkflow + forEach', () => {
    const steps = [
      { name: 'Agent Step', prompt: 'Do stuff', maxTurns: 3 },
      { type: 'subWorkflow' as const, name: 'Sub', workflowId: 'wf-sub' },
      { type: 'forEach' as const, name: 'Loop', prompt: 'P', iterateOver: 'arr', itemVariable: 'item' }
    ];
    const dto = createFullWorkflowDTO({ steps: steps as any });
    const data = workflowToData(dto);

    expect(data.steps).toHaveLength(3);
    // agent 步骤被转换
    expect(data.steps[0].max_turns).toBe(3);
    expect((data.steps[0] as any).maxTurns).toBeUndefined();
    // subWorkflow 透传
    expect((data.steps[1] as any).type).toBe('subWorkflow');
    // forEach 透传
    expect((data.steps[2] as any).type).toBe('forEach');
  });
});

// ========== dataToCreateRequest ==========

describe('dataToCreateRequest', () => {
  it('全字段逆映射：snake_case → camelCase', () => {
    const dto = createFullWorkflowDTO();
    const data = workflowToData(dto);
    const request = dataToCreateRequest(data);

    expect(request.name).toBe('Test Workflow');
    expect(request.enabled).toBe(true);
    expect(request.schedule).toBe('0 9 * * *');
    expect(request.rules).toBe('Always use TypeScript');
    expect(request.skills).toEqual({ 'my-skill': 'skill content' });
    expect(request.workingDirectory).toBe('/home/user/project');
    expect(request.onFailure).toBe('stop');
    expect(request.retryConfig).toEqual({ maxAttempts: 2, delayMs: 500 });
  });

  it('inputs 解包：{ items: [...] } → WorkflowInput[]', () => {
    const dto = createFullWorkflowDTO();
    const data = workflowToData(dto);
    const request = dataToCreateRequest(data);

    expect(request.inputs).toEqual([
      { name: 'env', type: 'string', required: true, description: 'Target environment' }
    ]);
  });

  it('无 inputs 时返回 undefined', () => {
    const request = dataToCreateRequest({ name: 'Test', steps: [{ name: 'S1', prompt: 'P1' }] });

    expect(request.inputs).toBeUndefined();
  });

  it('agent 步骤 validation 重组为嵌套对象', () => {
    const data = workflowToData(createFullWorkflowDTO());
    const request = dataToCreateRequest(data);
    const step = request.steps[0];

    expect(step.name).toBe('Step 1');
    expect((step as any).maxTurns).toBe(5);
    expect((step as any).validation).toEqual({
      prompt: 'Check output',
      rules: [{ type: 'contains', value: 'success' }]
    });
    expect((step as any).skillIds).toEqual(['skill-001', 'skill-002']);
  });

  it('空 validation 不生成空对象', () => {
    const request = dataToCreateRequest({
      name: 'Test',
      steps: [{ name: 'S1', prompt: 'P1', validation_prompt: '', validation_rules: [] }]
    });

    expect((request.steps[0] as any).validation).toBeUndefined();
  });

  it('仅有 validation_prompt 时生成 validation', () => {
    const request = dataToCreateRequest({
      name: 'Test',
      steps: [{ name: 'S1', prompt: 'P1', validation_prompt: 'Check it', validation_rules: [] }]
    });

    expect((request.steps[0] as any).validation).toEqual({
      prompt: 'Check it',
      rules: undefined
    });
  });

  it('仅有 validation_rules 时生成 validation', () => {
    const request = dataToCreateRequest({
      name: 'Test',
      steps: [{
        name: 'S1', prompt: 'P1',
        validation_prompt: '',
        validation_rules: [{ type: 'regex' as const, pattern: '\\d+' }]
      }]
    });

    expect((request.steps[0] as any).validation).toEqual({
      prompt: undefined,
      rules: [{ type: 'regex', pattern: '\\d+' }]
    });
  });

  it('schedule 为 null 时归一化为 undefined', () => {
    const request = dataToCreateRequest({
      name: 'Test', schedule: null,
      steps: [{ name: 'S1', prompt: 'P1' }]
    });

    expect(request.schedule).toBeUndefined();
  });

  it('working_directory 为 null 时归一化为 undefined', () => {
    const request = dataToCreateRequest({
      name: 'Test', working_directory: null,
      steps: [{ name: 'S1', prompt: 'P1' }]
    });

    expect(request.workingDirectory).toBeUndefined();
  });

  it('subWorkflow 步骤透传', () => {
    const request = dataToCreateRequest({
      name: 'Test',
      steps: [{
        type: 'subWorkflow', name: 'Sub', workflowId: 'wf-sub'
      } as any]
    });

    expect((request.steps[0] as any).type).toBe('subWorkflow');
    expect((request.steps[0] as any).workflowId).toBe('wf-sub');
  });

  it('on_failure 默认为 stop', () => {
    const request = dataToCreateRequest({
      name: 'Test',
      steps: [{ name: 'S1', prompt: 'P1' }]
    });

    expect(request.onFailure).toBe('stop');
  });
});

// ========== 往返一致性 ==========

describe('Round-trip: workflowToData → dataToCreateRequest', () => {
  it('agent 步骤往返后语义等价', () => {
    const original = createFullWorkflowDTO();
    const roundTripped = dataToCreateRequest(workflowToData(original));

    expect(roundTripped.name).toBe(original.name);
    expect(roundTripped.schedule).toBe(original.schedule);
    expect(roundTripped.inputs).toEqual(original.inputs);
    expect(roundTripped.rules).toBe(original.rules);
    expect(roundTripped.workingDirectory).toBe(original.workingDirectory);
    expect(roundTripped.onFailure).toBe(original.onFailure);
    expect(roundTripped.retryConfig).toEqual(original.retryConfig);

    const step = roundTripped.steps[0] as any;
    expect(step.name).toBe('Step 1');
    expect(step.maxTurns).toBe(5);
    expect(step.validation).toEqual({
      prompt: 'Check output',
      rules: [{ type: 'contains', value: 'success' }]
    });
  });

  it('subWorkflow 步骤往返后完整保留', () => {
    const subStep = {
      type: 'subWorkflow' as const,
      name: 'Sub',
      workflowId: 'wf-sub',
      inputMapping: { env: '{{inputs.env}}' },
      onFailure: 'skip' as const
    };
    const dto = createFullWorkflowDTO({ steps: [subStep as any] });
    const roundTripped = dataToCreateRequest(workflowToData(dto));

    expect(roundTripped.steps[0]).toEqual(subStep);
  });

  it('forEach 步骤往返后完整保留', () => {
    const forEachStep = {
      type: 'forEach' as const,
      name: 'Loop',
      prompt: 'Process {{item}}',
      iterateOver: '{{steps.prev.output}}',
      itemVariable: 'item',
      maxTurns: 10
    };
    const dto = createFullWorkflowDTO({ steps: [forEachStep as any] });
    const roundTripped = dataToCreateRequest(workflowToData(dto));

    expect(roundTripped.steps[0]).toEqual(forEachStep);
  });

  it('dataSplit 步骤往返后完整保留', () => {
    const dataSplitStep = {
      type: 'dataSplit' as const,
      name: 'Split',
      mode: 'template' as const,
      templateExpr: '{{steps.prev.output}}'
    };
    const dto = createFullWorkflowDTO({ steps: [dataSplitStep as any] });
    const roundTripped = dataToCreateRequest(workflowToData(dto));

    expect(roundTripped.steps[0]).toEqual(dataSplitStep);
  });
});

// ========== executionToData ==========

describe('executionToData', () => {
  it('全字段映射：camelCase → snake_case', () => {
    const dto = createFullExecutionDTO();
    const data = executionToData(dto);

    expect(data.id).toBe('exec-001');
    expect(data.workflow_id).toBe('wf-001');
    expect(data.workflow_name).toBe('Test Workflow');
    expect(data.trigger_type).toBe('manual');
    expect(data.status).toBe('success');
    expect(data.started_at).toBe('2026-03-14T00:00:00Z');
    expect(data.finished_at).toBe('2026-03-14T00:05:00Z');
    expect(data.current_step).toBe(2);
    expect(data.total_steps).toBe(2);
    expect(data.total_tokens).toBe(5000);
    expect(data.error_message).toBeUndefined();
  });

  it('totalSteps 为 undefined 时从 stepExecutions.length 计算', () => {
    const dto = createFullExecutionDTO({ totalSteps: undefined });
    const data = executionToData(dto);

    expect(data.total_steps).toBe(1); // stepExecutions has 1 entry
  });

  it('totalSteps 和 stepExecutions 都为 undefined 时返回 0', () => {
    const dto = createFullExecutionDTO({ totalSteps: undefined, stepExecutions: undefined });
    const data = executionToData(dto);

    expect(data.total_steps).toBe(0);
  });

  it('workflowName 为 undefined 时返回空字符串', () => {
    const dto = createFullExecutionDTO({ workflowName: undefined });
    const data = executionToData(dto);

    expect(data.workflow_name).toBe('');
  });

  it('stepExecutions 递归映射', () => {
    const dto = createFullExecutionDTO();
    const data = executionToData(dto);
    const step = data.step_executions![0];

    expect(step.id).toBe('se-001');
    expect(step.execution_id).toBe('exec-001');
    expect(step.step_index).toBe(0);
    expect(step.step_name).toBe('Step 1');
    expect(step.tokens_used).toBe(2500);
    expect(step.model_used).toBe('claude-sonnet-4-20250514');
    expect(step.validation_status).toBe('passed');
    expect(step.validation_output).toBe('OK');
    expect(step.events).toEqual([{ type: 'text', text: 'hello' }]);
  });

  it('无 stepExecutions 时返回 undefined', () => {
    const dto = createFullExecutionDTO({ stepExecutions: undefined });
    const data = executionToData(dto);

    expect(data.step_executions).toBeUndefined();
  });
});

// ========== stepExecutionToData ==========

describe('stepExecutionToData', () => {
  it('stepName 为空时生成默认名称', () => {
    const stepDTO: StepExecutionDTO = {
      id: 'se-001',
      executionId: 'exec-001',
      stepIndex: 2,
      stepName: undefined,
      status: 'running',
      tokensUsed: 0
    };
    const data = stepExecutionToData(stepDTO);

    expect(data.step_name).toBe('Step 3'); // stepIndex 2 → "Step 3"
  });

  it('全字段映射', () => {
    const stepDTO: StepExecutionDTO = {
      id: 'se-001',
      executionId: 'exec-001',
      stepIndex: 0,
      stepName: 'My Step',
      status: 'success',
      startedAt: '2026-03-14T00:00:00Z',
      finishedAt: '2026-03-14T00:01:00Z',
      promptRendered: 'rendered prompt',
      outputText: 'output here',
      tokensUsed: 1500,
      modelUsed: 'claude-sonnet-4-20250514',
      errorMessage: 'some error',
      validationStatus: 'failed',
      validationOutput: 'validation failed msg'
    };
    const data = stepExecutionToData(stepDTO);

    expect(data.id).toBe('se-001');
    expect(data.execution_id).toBe('exec-001');
    expect(data.step_index).toBe(0);
    expect(data.step_name).toBe('My Step');
    expect(data.status).toBe('success');
    expect(data.started_at).toBe('2026-03-14T00:00:00Z');
    expect(data.finished_at).toBe('2026-03-14T00:01:00Z');
    expect(data.prompt_rendered).toBe('rendered prompt');
    expect(data.output_text).toBe('output here');
    expect(data.tokens_used).toBe(1500);
    expect(data.model_used).toBe('claude-sonnet-4-20250514');
    expect(data.error_message).toBe('some error');
    expect(data.validation_status).toBe('failed');
    expect(data.validation_output).toBe('validation failed msg');
  });
});
