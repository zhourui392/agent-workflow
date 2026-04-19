/**
 * 配置合并器单元测试
 *
 * @author zhourui(V33215020)
 * @since 2026/03/14
 */

import { describe, it, expect, vi } from 'vitest'
import { ConfigMergeService } from '../src/main/configuration/domain/service/ConfigMergeService'
import type { WorkflowConfigRef } from '../src/main/configuration/domain/service/ConfigMergeService'
import type { GlobalConfig, MergedConfig, ReferenceValidationResult } from '../src/main/configuration/domain/model'
import {
  createMockSkillRepository,
  createMockGlobalConfigProvider,
  createMockSkillFileWriter
} from './fixtures'

// ConfigMergeService with fixture-based mock dependencies
const service = new ConfigMergeService(
  createMockSkillRepository() as any,
  createMockGlobalConfigProvider(),
  createMockSkillFileWriter()
)

const mergeConfig = (global: GlobalConfig, workflow: WorkflowConfigRef) => service.mergeWorkflowConfig(global, workflow)
const handleDanglingReferences = (result: ReferenceValidationResult, onWarning?: (msg: string) => void) => service.handleDanglingReferences(result, onWarning)

function createWorkflow(overrides: Partial<WorkflowConfigRef & { id: string; name: string; enabled: boolean; steps: unknown[]; onFailure: string }> = {}): WorkflowConfigRef {
  return {
    rules: overrides.rules,
    skills: overrides.skills,
    limits: overrides.limits,
    workingDirectory: overrides.workingDirectory,
    ...overrides
  }
}

// ========== mergeConfig ==========

describe('mergeConfig', () => {
  it('systemPrompt 拼接全局和工作流 rules', () => {
    const global: GlobalConfig = { systemPrompt: '全局规则' }
    const workflow = createWorkflow({ rules: '工作流规则' })

    const merged = mergeConfig(global, workflow)
    expect(merged.systemPrompt).toBe('全局规则\n\n工作流规则')
  })

  it('仅有全局 systemPrompt 时直接使用', () => {
    const global: GlobalConfig = { systemPrompt: '全局规则' }
    const workflow = createWorkflow()

    const merged = mergeConfig(global, workflow)
    expect(merged.systemPrompt).toBe('全局规则')
  })

  it('仅有工作流 rules 时直接使用', () => {
    const global: GlobalConfig = {}
    const workflow = createWorkflow({ rules: '工作流规则' })

    const merged = mergeConfig(global, workflow)
    expect(merged.systemPrompt).toBe('工作流规则')
  })

  it('两者都为空时不设置 systemPrompt', () => {
    const global: GlobalConfig = {}
    const workflow = createWorkflow()

    const merged = mergeConfig(global, workflow)
    expect(merged.systemPrompt).toBeUndefined()
  })

  it('model 使用全局 defaultModel', () => {
    const global: GlobalConfig = { defaultModel: 'claude-sonnet-4-6' }
    const workflow = createWorkflow()

    const merged = mergeConfig(global, workflow)
    expect(merged.model).toBe('claude-sonnet-4-6')
  })

  it('skills 取并集，工作流覆盖全局', () => {
    const global: GlobalConfig = {
      skills: { skill1: 'content1', skill2: 'content2' }
    }
    const workflow = createWorkflow({
      skills: { skill2: 'content2-override', skill3: 'content3' }
    })

    const merged = mergeConfig(global, workflow)
    expect(merged.skills).toEqual({
      skill1: 'content1',
      skill2: 'content2-override',
      skill3: 'content3'
    })
  })

  it('limits 透传到 maxTurns 和 timeoutMs', () => {
    const global: GlobalConfig = {}
    const workflow = createWorkflow({
      limits: { maxTurns: 50, timeoutMs: 120000 }
    })

    const merged = mergeConfig(global, workflow)
    expect(merged.maxTurns).toBe(50)
    expect(merged.timeoutMs).toBe(120000)
  })

  it('workingDirectory 透传', () => {
    const global: GlobalConfig = {}
    const workflow = createWorkflow({ workingDirectory: '/path/to/work' })

    const merged = mergeConfig(global, workflow)
    expect(merged.workingDirectory).toBe('/path/to/work')
  })

  it('allowedTools 直接传递', () => {
    const global: GlobalConfig = {
      allowedTools: ['Read', 'Write', 'Bash']
    }
    const workflow = createWorkflow()

    const merged = mergeConfig(global, workflow)
    expect(merged.allowedTools).toEqual(['Read', 'Write', 'Bash'])
  })
})

// ========== mergeConfig with mcpServers ==========

describe('mergeConfig with mcpServers', () => {
  it('全局 mcpServers 透传到合并配置', () => {
    const global: GlobalConfig = {
      mcpServers: {
        playwright: { command: 'npx', args: ['-y', '@anthropic-ai/mcp-server-playwright'] }
      }
    }
    const workflow = createWorkflow()

    const merged = mergeConfig(global, workflow)
    expect(merged.mcpServers).toEqual({
      playwright: { command: 'npx', args: ['-y', '@anthropic-ai/mcp-server-playwright'] }
    })
  })

  it('无 mcpServers 时不设置', () => {
    const global: GlobalConfig = {}
    const workflow = createWorkflow()

    const merged = mergeConfig(global, workflow)
    expect(merged.mcpServers).toBeUndefined()
  })

  it('空 mcpServers 对象不设置', () => {
    const global: GlobalConfig = { mcpServers: {} }
    const workflow = createWorkflow()

    const merged = mergeConfig(global, workflow)
    expect(merged.mcpServers).toBeUndefined()
  })
})

// ========== buildAllowedTools ==========

describe('buildAllowedTools', () => {
  it('有 Skills 时添加 Skill 工具', () => {
    const result = service.buildAllowedTools(['Read'], true)
    expect(result).toContain('Skill')
  })

  it('无 Skills 时不添加 Skill 工具', () => {
    const result = service.buildAllowedTools(['Read'], false)
    expect(result).not.toContain('Skill')
  })

  it('已有 Skill 时不重复添加', () => {
    const result = service.buildAllowedTools(['Skill', 'Read'], true)
    expect(result.filter(t => t === 'Skill')).toHaveLength(1)
  })

  it('无基础工具且无 Skills 时返回空数组', () => {
    const result = service.buildAllowedTools(undefined, false)
    expect(result).toEqual([])
  })

  it('基础工具无 Skills 时返回基础工具', () => {
    const result = service.buildAllowedTools(['Read', 'Write'], false)
    expect(result).toEqual(['Read', 'Write'])
  })

  it('有 mcpServers 时自动添加 mcp__<name>__* 模式', () => {
    const mcpServers = {
      playwright: { command: 'npx', args: ['-y', '@anthropic-ai/mcp-server-playwright'] },
      github: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] }
    }
    const result = service.buildAllowedTools(['Read'], false, mcpServers)
    expect(result).toContain('mcp__playwright__*')
    expect(result).toContain('mcp__github__*')
    expect(result).toContain('Read')
  })

  it('无 mcpServers 时不添加 mcp 模式', () => {
    const result = service.buildAllowedTools(['Read'], false, undefined)
    expect(result).toEqual(['Read'])
  })

  it('mcp 模式不重复添加', () => {
    const mcpServers = {
      playwright: { command: 'npx' }
    }
    const result = service.buildAllowedTools(['mcp__playwright__*'], false, mcpServers)
    expect(result.filter(t => t === 'mcp__playwright__*')).toHaveLength(1)
  })

  it('mcpTools 指定具体工具名时展开为 mcp__<server>__<tool> 而非通配符', () => {
    const mcpServers = {
      playwright: { command: 'npx' }
    }
    const mcpTools = { playwright: ['browser_navigate', 'browser_click'] }
    const result = service.buildAllowedTools(['Read'], false, mcpServers, mcpTools)
    expect(result).toContain('mcp__playwright__browser_navigate')
    expect(result).toContain('mcp__playwright__browser_click')
    expect(result).not.toContain('mcp__playwright__*')
  })

  it("mcpTools 指定 '*' 时保留通配符", () => {
    const mcpServers = {
      playwright: { command: 'npx' }
    }
    const mcpTools = { playwright: '*' as const }
    const result = service.buildAllowedTools(['Read'], false, mcpServers, mcpTools)
    expect(result).toContain('mcp__playwright__*')
  })

  it('server 不在 mcpTools map 中时不添加任何 mcp 模式', () => {
    const mcpServers = {
      playwright: { command: 'npx' },
      github: { command: 'npx' }
    }
    const mcpTools = { playwright: '*' as const }
    const result = service.buildAllowedTools(['Read'], false, mcpServers, mcpTools)
    expect(result).toContain('mcp__playwright__*')
    expect(result.some(t => t.startsWith('mcp__github__'))).toBe(false)
  })

  it('mcpTools 为 undefined 时保留旧的"全部启用通配符"行为', () => {
    const mcpServers = {
      playwright: { command: 'npx' },
      github: { command: 'npx' }
    }
    const result = service.buildAllowedTools(['Read'], false, mcpServers, undefined)
    expect(result).toContain('mcp__playwright__*')
    expect(result).toContain('mcp__github__*')
  })
})

// ========== buildStepMergedConfig with mcpTools ==========

describe('buildStepMergedConfig with mcpTools', () => {
  const base = {
    mcpServers: {
      playwright: { command: 'npx' },
      github: { command: 'npx' }
    }
  }

  it("step.mcpTools 未设置时 mcpServers 透传全部（向后兼容）", () => {
    const stepConfig = service.buildStepMergedConfig(
      base, { skills: {} }, { }, 'exec-1', 0
    )
    expect(stepConfig.mcpServers).toEqual(base.mcpServers)
  })

  it("step.mcpTools 只勾选 playwright 时 mcpServers 仅保留 playwright", () => {
    const stepConfig = service.buildStepMergedConfig(
      base, { skills: {} }, { mcpTools: { playwright: '*' } }, 'exec-1', 0
    )
    expect(stepConfig.mcpServers).toEqual({ playwright: base.mcpServers.playwright })
    expect(stepConfig.mcpServers).not.toHaveProperty('github')
  })

  it("step.mcpTools 为具体工具数组时 allowedTools 展开具体工具名", () => {
    const stepConfig = service.buildStepMergedConfig(
      base, { skills: {} }, { mcpTools: { playwright: ['browser_navigate'] } }, 'exec-1', 0
    )
    expect(stepConfig.allowedTools).toContain('mcp__playwright__browser_navigate')
    expect(stepConfig.allowedTools).not.toContain('mcp__playwright__*')
    expect(stepConfig.allowedTools?.some(t => t.startsWith('mcp__github__'))).toBe(false)
  })

  it("step.mcpTools 空对象时所有 server 都不启用", () => {
    const stepConfig = service.buildStepMergedConfig(
      base, { skills: {} }, { mcpTools: {} }, 'exec-1', 0
    )
    expect(stepConfig.mcpServers).toBeUndefined()
    expect(stepConfig.allowedTools?.some(t => t.startsWith('mcp__'))).toBe(false)
  })

  it("workflow.mcpTools 作为默认值，step.mcpTools 未设置时生效", () => {
    const stepConfig = service.buildStepMergedConfig(
      base,
      { skills: {}, mcpTools: { playwright: ['browser_navigate'] } },
      {},
      'exec-1',
      0
    )
    expect(stepConfig.mcpServers).toEqual({ playwright: base.mcpServers.playwright })
    expect(stepConfig.allowedTools).toContain('mcp__playwright__browser_navigate')
    expect(stepConfig.allowedTools?.some(t => t.startsWith('mcp__github__'))).toBe(false)
  })

  it("step.mcpTools 定义时整体覆盖 workflow.mcpTools", () => {
    const stepConfig = service.buildStepMergedConfig(
      base,
      { skills: {}, mcpTools: { playwright: '*' } },
      { mcpTools: { github: '*' } },
      'exec-1',
      0
    )
    expect(stepConfig.mcpServers).toEqual({ github: base.mcpServers.github })
    expect(stepConfig.allowedTools).toContain('mcp__github__*')
    expect(stepConfig.allowedTools?.some(t => t.startsWith('mcp__playwright__'))).toBe(false)
  })

  it("step.mcpTools 空对象也视为显式覆盖 workflow.mcpTools（禁用全部）", () => {
    const stepConfig = service.buildStepMergedConfig(
      base,
      { skills: {}, mcpTools: { playwright: '*' } },
      { mcpTools: {} },
      'exec-1',
      0
    )
    expect(stepConfig.mcpServers).toBeUndefined()
    expect(stepConfig.allowedTools?.some(t => t.startsWith('mcp__'))).toBe(false)
  })
})

// ========== handleDanglingReferences ==========

describe('handleDanglingReferences', () => {
  it('valid 时不调用回调', () => {
    const callback = vi.fn()
    const result: ReferenceValidationResult = {
      valid: true,
      missingSkillIds: []
    }
    handleDanglingReferences(result, callback)
    expect(callback).not.toHaveBeenCalled()
  })

  it('缺少 Skill 时调用回调', () => {
    const callback = vi.fn()
    const result: ReferenceValidationResult = {
      valid: false,
      missingSkillIds: ['skill-1']
    }
    handleDanglingReferences(result, callback)
    expect(callback).toHaveBeenCalledOnce()
    expect(callback.mock.calls[0][0]).toContain('skill-1')
  })

  it('无回调时不报错', () => {
    const result: ReferenceValidationResult = {
      valid: false,
      missingSkillIds: ['skill-1']
    }
    expect(() => handleDanglingReferences(result)).not.toThrow()
  })
})
