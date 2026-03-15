/**
 * 领域模型单元测试
 *
 * 测试聚合根的业务行为和不变量保护。
 */

import { describe, it, expect } from 'vitest';
import { createTestWorkflow, createTestExecution } from './fixtures';

// ========== Workflow 聚合根 ==========

describe('Workflow', () => {
  describe('toggle / enable / disable', () => {
    it('toggle 切换启用状态', () => {
      const wf = createTestWorkflow({ enabled: true });
      wf.toggle();
      expect(wf.enabled).toBe(false);
      wf.toggle();
      expect(wf.enabled).toBe(true);
    });

    it('enable / disable 设置特定状态', () => {
      const wf = createTestWorkflow({ enabled: false });
      wf.enable();
      expect(wf.enabled).toBe(true);
      wf.disable();
      expect(wf.enabled).toBe(false);
    });
  });

  describe('isSchedulable', () => {
    it('启用且有 schedule 时返回 true', () => {
      const wf = createTestWorkflow({ enabled: true, schedule: '0 9 * * *' });
      expect(wf.isSchedulable).toBe(true);
    });

    it('禁用时返回 false', () => {
      const wf = createTestWorkflow({ enabled: false, schedule: '0 9 * * *' });
      expect(wf.isSchedulable).toBe(false);
    });

    it('无 schedule 时返回 false', () => {
      const wf = createTestWorkflow({ enabled: true });
      expect(wf.isSchedulable).toBe(false);
    });

    it('空字符串 schedule 返回 false', () => {
      const wf = createTestWorkflow({ enabled: true, schedule: '  ' });
      expect(wf.isSchedulable).toBe(false);
    });
  });

  describe('stepCount', () => {
    it('返回步骤数量', () => {
      const wf = createTestWorkflow();
      expect(wf.stepCount).toBe(2);
    });
  });

  describe('hasUniqueStepNames', () => {
    it('名称唯一时返回 true', () => {
      const wf = createTestWorkflow({
        steps: [
          { name: 'A', prompt: 'a' },
          { name: 'B', prompt: 'b' }
        ]
      });
      expect(wf.hasUniqueStepNames()).toBe(true);
    });

    it('名称重复时返回 false', () => {
      const wf = createTestWorkflow({
        steps: [
          { name: 'A', prompt: 'a' },
          { name: 'A', prompt: 'b' }
        ]
      });
      expect(wf.hasUniqueStepNames()).toBe(false);
    });
  });

  describe('getDuplicateStepNames', () => {
    it('返回重复的名称列表', () => {
      const wf = createTestWorkflow({
        steps: [
          { name: 'A', prompt: 'a' },
          { name: 'B', prompt: 'b' },
          { name: 'A', prompt: 'c' }
        ]
      });
      expect(wf.getDuplicateStepNames()).toEqual(['A']);
    });

    it('无重复时返回空数组', () => {
      const wf = createTestWorkflow();
      expect(wf.getDuplicateStepNames()).toEqual([]);
    });
  });

  describe('findStepIndex', () => {
    it('找到步骤返回索引', () => {
      const wf = createTestWorkflow();
      expect(wf.findStepIndex('Step 1')).toBe(0);
      expect(wf.findStepIndex('Step 2')).toBe(1);
    });

    it('未找到返回 -1', () => {
      const wf = createTestWorkflow();
      expect(wf.findStepIndex('Not Exist')).toBe(-1);
    });
  });

  describe('validate', () => {
    it('合法配置返回空错误列表', () => {
      const wf = createTestWorkflow();
      expect(wf.validate()).toEqual([]);
    });

    it('空名称报错', () => {
      const wf = createTestWorkflow({ name: '' });
      expect(wf.validate()).toContain('工作流名称不能为空');
    });

    it('无步骤报错', () => {
      const wf = createTestWorkflow({ steps: [] });
      expect(wf.validate()).toContain('至少需要一个步骤');
    });

    it('步骤名称重复报错', () => {
      const wf = createTestWorkflow({
        steps: [
          { name: 'Dup', prompt: 'a' },
          { name: 'Dup', prompt: 'b' }
        ]
      });
      const errors = wf.validate();
      expect(errors.some(e => e.includes('步骤名称重复'))).toBe(true);
    });

    it('步骤提示词为空报错', () => {
      const wf = createTestWorkflow({
        steps: [{ name: 'Empty', prompt: '' }]
      });
      const errors = wf.validate();
      expect(errors.some(e => e.includes('提示词不能为空'))).toBe(true);
    });

    it('limits 合法时不报错', () => {
      const wf = createTestWorkflow({ limits: { maxTurns: 10 } });
      expect(wf.validate()).toEqual([]);
    });

    it('subWorkflow 步骤无需 prompt，校验通过', () => {
      const wf = createTestWorkflow({
        steps: [
          { type: 'subWorkflow', name: 'Call Sub', workflowId: 'wf-sub-001' } as any
        ]
      });
      expect(wf.validate()).toEqual([]);
    });

    it('subWorkflow 步骤缺少 workflowId 报错', () => {
      const wf = createTestWorkflow({
        steps: [
          { type: 'subWorkflow', name: 'Bad Sub' } as any
        ]
      });
      const errors = wf.validate();
      expect(errors.some(e => e.includes('workflowId'))).toBe(true);
    });

    it('subWorkflow forEach 缺少 iterateOver 报错', () => {
      const wf = createTestWorkflow({
        steps: [
          {
            type: 'subWorkflow', name: 'Loop', workflowId: 'wf-sub-001',
            forEach: { itemVariable: 'item' }
          } as any
        ]
      });
      const errors = wf.validate();
      expect(errors.some(e => e.includes('iterateOver'))).toBe(true);
    });

    it('subWorkflow forEach 缺少 itemVariable 报错', () => {
      const wf = createTestWorkflow({
        steps: [
          {
            type: 'subWorkflow', name: 'Loop', workflowId: 'wf-sub-001',
            forEach: { iterateOver: '{{steps.split.output}}' }
          } as any
        ]
      });
      const errors = wf.validate();
      expect(errors.some(e => e.includes('itemVariable'))).toBe(true);
    });

    it('subWorkflow forEach 配置完整时校验通过', () => {
      const wf = createTestWorkflow({
        steps: [
          {
            type: 'subWorkflow', name: 'Loop', workflowId: 'wf-sub-001',
            forEach: { iterateOver: '{{steps.split.output}}', itemVariable: 'task' }
          } as any
        ]
      });
      expect(wf.validate()).toEqual([]);
    });

    it('混合 agent 和 subWorkflow 步骤校验通过', () => {
      const wf = createTestWorkflow({
        steps: [
          { name: 'Split', prompt: 'Split tasks' },
          { type: 'subWorkflow', name: 'Execute', workflowId: 'wf-sub-001' } as any,
          { name: 'Summary', prompt: 'Summarize results' }
        ]
      });
      expect(wf.validate()).toEqual([]);
    });

    // ===== forEach 步骤验证 =====

    it('forEach 步骤配置完整时校验通过', () => {
      const wf = createTestWorkflow({
        steps: [
          {
            type: 'forEach', name: 'Process', prompt: 'Handle {{inputs.item}}',
            iterateOver: '{{steps.split.output}}', itemVariable: 'item'
          } as any
        ]
      });
      expect(wf.validate()).toEqual([]);
    });

    it('forEach 步骤缺少 prompt 报错', () => {
      const wf = createTestWorkflow({
        steps: [
          {
            type: 'forEach', name: 'Process', prompt: '',
            iterateOver: '{{steps.split.output}}', itemVariable: 'item'
          } as any
        ]
      });
      const errors = wf.validate();
      expect(errors.some(e => e.includes('提示词'))).toBe(true);
    });

    it('forEach 步骤缺少 iterateOver 报错', () => {
      const wf = createTestWorkflow({
        steps: [
          {
            type: 'forEach', name: 'Process', prompt: 'Do it',
            itemVariable: 'item'
          } as any
        ]
      });
      const errors = wf.validate();
      expect(errors.some(e => e.includes('iterateOver'))).toBe(true);
    });

    it('forEach 步骤缺少 itemVariable 报错', () => {
      const wf = createTestWorkflow({
        steps: [
          {
            type: 'forEach', name: 'Process', prompt: 'Do it',
            iterateOver: '{{steps.split.output}}'
          } as any
        ]
      });
      const errors = wf.validate();
      expect(errors.some(e => e.includes('itemVariable'))).toBe(true);
    });

    // ===== dataSplit 步骤验证 =====

    it('dataSplit static 模式校验通过', () => {
      const wf = createTestWorkflow({
        steps: [
          { type: 'dataSplit', name: 'Split', mode: 'static', staticData: '["a","b"]' } as any
        ]
      });
      expect(wf.validate()).toEqual([]);
    });

    it('dataSplit static 模式缺少 staticData 报错', () => {
      const wf = createTestWorkflow({
        steps: [
          { type: 'dataSplit', name: 'Split', mode: 'static' } as any
        ]
      });
      const errors = wf.validate();
      expect(errors.some(e => e.includes('staticData'))).toBe(true);
    });

    it('dataSplit static 模式 staticData 不是合法 JSON 数组报错', () => {
      const wf = createTestWorkflow({
        steps: [
          { type: 'dataSplit', name: 'Split', mode: 'static', staticData: '{"not":"array"}' } as any
        ]
      });
      const errors = wf.validate();
      expect(errors.some(e => e.includes('JSON 数组'))).toBe(true);
    });

    it('dataSplit template 模式校验通过', () => {
      const wf = createTestWorkflow({
        steps: [
          { type: 'dataSplit', name: 'Split', mode: 'template', templateExpr: '{{steps.fetch.output}}' } as any
        ]
      });
      expect(wf.validate()).toEqual([]);
    });

    it('dataSplit template 模式缺少 templateExpr 报错', () => {
      const wf = createTestWorkflow({
        steps: [
          { type: 'dataSplit', name: 'Split', mode: 'template' } as any
        ]
      });
      const errors = wf.validate();
      expect(errors.some(e => e.includes('templateExpr'))).toBe(true);
    });

    it('dataSplit ai 模式校验通过', () => {
      const wf = createTestWorkflow({
        steps: [
          { type: 'dataSplit', name: 'Split', mode: 'ai', aiInput: '需求文档内容' } as any
        ]
      });
      expect(wf.validate()).toEqual([]);
    });

    it('dataSplit ai 模式缺少 aiInput 报错', () => {
      const wf = createTestWorkflow({
        steps: [
          { type: 'dataSplit', name: 'Split', mode: 'ai' } as any
        ]
      });
      const errors = wf.validate();
      expect(errors.some(e => e.includes('aiInput'))).toBe(true);
    });
  });
});

// ========== Execution 聚合根 ==========

describe('Execution', () => {
  describe('状态机转换', () => {
    it('pending → running', () => {
      const exec = createTestExecution({ status: 'pending' });
      exec.markRunning();
      expect(exec.status).toBe('running');
    });

    it('running → success', () => {
      const exec = createTestExecution({ status: 'running' });
      exec.markSuccess();
      expect(exec.status).toBe('success');
      expect(exec.finishedAt).toBeDefined();
    });

    it('running → failed', () => {
      const exec = createTestExecution({ status: 'running' });
      exec.markFailed('something broke');
      expect(exec.status).toBe('failed');
      expect(exec.errorMessage).toBe('something broke');
      expect(exec.finishedAt).toBeDefined();
    });

    it('pending → failed (直接失败)', () => {
      const exec = createTestExecution({ status: 'pending' });
      exec.markFailed('init error');
      expect(exec.status).toBe('failed');
    });

    it('success → running 抛出错误（非法回退）', () => {
      const exec = createTestExecution({ status: 'success' });
      expect(() => exec.markRunning()).toThrow('非法状态转换');
    });

    it('failed → running 抛出错误（非法回退）', () => {
      const exec = createTestExecution({ status: 'failed' });
      expect(() => exec.markRunning()).toThrow('非法状态转换');
    });

    it('success → success 抛出错误（终态不可重入）', () => {
      const exec = createTestExecution({ status: 'success' });
      expect(() => exec.markSuccess()).toThrow('非法状态转换');
    });

    it('running → running 抛出错误（不可重入）', () => {
      const exec = createTestExecution({ status: 'running' });
      expect(() => exec.markRunning()).toThrow('非法状态转换');
    });
  });

  describe('markCancelled', () => {
    it('pending → cancelled', () => {
      const exec = createTestExecution({ status: 'pending' });
      exec.markCancelled();
      expect(exec.status).toBe('cancelled');
      expect(exec.finishedAt).toBeDefined();
    });

    it('running → cancelled', () => {
      const exec = createTestExecution({ status: 'running' });
      exec.markCancelled();
      expect(exec.status).toBe('cancelled');
      expect(exec.finishedAt).toBeDefined();
    });

    it('success → cancelled 抛出错误（终态不可取消）', () => {
      const exec = createTestExecution({ status: 'success' });
      expect(() => exec.markCancelled()).toThrow('非法状态转换');
    });

    it('failed → cancelled 抛出错误', () => {
      const exec = createTestExecution({ status: 'failed' });
      expect(() => exec.markCancelled()).toThrow('非法状态转换');
    });
  });

  describe('isTerminal', () => {
    it('success 是终态', () => {
      const exec = createTestExecution({ status: 'success' });
      expect(exec.isTerminal).toBe(true);
    });

    it('failed 是终态', () => {
      const exec = createTestExecution({ status: 'failed' });
      expect(exec.isTerminal).toBe(true);
    });

    it('cancelled 是终态', () => {
      const exec = createTestExecution({ status: 'cancelled' });
      expect(exec.isTerminal).toBe(true);
    });

    it('pending 非终态', () => {
      const exec = createTestExecution({ status: 'pending' });
      expect(exec.isTerminal).toBe(false);
    });

    it('running 非终态', () => {
      const exec = createTestExecution({ status: 'running' });
      expect(exec.isTerminal).toBe(false);
    });
  });

  describe('addTokens', () => {
    it('累加 token', () => {
      const exec = createTestExecution({ totalTokens: 100 });
      exec.addTokens(50);
      expect(exec.totalTokens).toBe(150);
      exec.addTokens(200);
      expect(exec.totalTokens).toBe(350);
    });

    it('添加 0 token 不变', () => {
      const exec = createTestExecution({ totalTokens: 100 });
      exec.addTokens(0);
      expect(exec.totalTokens).toBe(100);
    });

    it('负数 token 抛出错误', () => {
      const exec = createTestExecution();
      expect(() => exec.addTokens(-1)).toThrow('不能为负数');
    });
  });

  describe('advanceStep', () => {
    it('推进到指定步骤', () => {
      const exec = createTestExecution({ currentStep: 0 });
      exec.advanceStep(1);
      expect(exec.currentStep).toBe(1);
      exec.advanceStep(3);
      expect(exec.currentStep).toBe(3);
    });

    it('负数索引抛出错误', () => {
      const exec = createTestExecution();
      expect(() => exec.advanceStep(-1)).toThrow('不能为负数');
    });
  });

});
