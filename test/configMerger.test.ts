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
