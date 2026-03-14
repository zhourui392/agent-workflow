/**
 * 配置合并器单元测试
 *
 * @author zhourui(V33215020)
 * @since 2026/03/14
 */

import { describe, it, expect, vi } from 'vitest'
import { ConfigMergeService } from '../src/main/configuration/domain/service/ConfigMergeService'
import type { WorkflowConfigRef } from '../src/main/configuration/domain/service/ConfigMergeService'
import type { GlobalConfig, MergedConfig, McpServerConfig, ReferenceValidationResult } from '../src/main/configuration/domain/model'
import {
  createMockMcpServerRepository,
  createMockSkillRepository,
  createMockGlobalConfigProvider,
  createMockSkillFileWriter
} from './fixtures'

// ConfigMergeService with fixture-based mock dependencies
const service = new ConfigMergeService(
  createMockMcpServerRepository() as any,
  createMockSkillRepository() as any,
  createMockGlobalConfigProvider(),
  createMockSkillFileWriter()
)

const mergeConfig = (global: GlobalConfig, workflow: WorkflowConfigRef) => service.mergeWorkflowConfig(global, workflow)
const buildAllowedTools = (base: string[] | undefined, mcpServers: Record<string, McpServerConfig>, hasSkills: boolean) => service.buildAllowedTools(base, mcpServers, hasSkills)
const handleDanglingReferences = (result: ReferenceValidationResult, onWarning?: (msg: string) => void) => service.handleDanglingReferences(result, onWarning)

function getStepConfig(mergedConfig: MergedConfig, stepModel?: string, stepMaxTurns?: number): MergedConfig {
  if (!stepModel && !stepMaxTurns) return mergedConfig
  return { ...mergedConfig, ...(stepModel && { model: stepModel }), ...(stepMaxTurns && { maxTurns: stepMaxTurns }) }
}

function createWorkflow(overrides: Partial<WorkflowConfigRef & { id: string; name: string; enabled: boolean; steps: unknown[]; onFailure: string }> = {}): WorkflowConfigRef {
  return {
    rules: overrides.rules,
    mcpServers: overrides.mcpServers,
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

  it('mcpServers 取并集，工作流覆盖全局', () => {
    const global: GlobalConfig = {
      mcpServers: {
        server1: { command: 'cmd1' },
        server2: { command: 'cmd2' }
      }
    }
    const workflow = createWorkflow({
      mcpServers: {
        server2: { command: 'cmd2-override' },
        server3: { command: 'cmd3' }
      }
    })

    const merged = mergeConfig(global, workflow)
    expect(merged.mcpServers).toEqual({
      server1: { command: 'cmd1' },
      server2: { command: 'cmd2-override' },
      server3: { command: 'cmd3' }
    })
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

  it('无 mcpServers 时不设置', () => {
    const global: GlobalConfig = {}
    const workflow = createWorkflow()

    const merged = mergeConfig(global, workflow)
    expect(merged.mcpServers).toBeUndefined()
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

  it('allowedTools 无工作流 MCP 时直接传递', () => {
    const global: GlobalConfig = {
      allowedTools: ['Read', 'Write', 'Bash']
    }
    const workflow = createWorkflow()

    const merged = mergeConfig(global, workflow)
    expect(merged.allowedTools).toEqual(['Read', 'Write', 'Bash'])
  })
})

// ========== getStepConfig ==========

describe('getStepConfig', () => {
  const baseConfig: MergedConfig = {
    model: 'claude-sonnet-4-6',
    maxTurns: 30,
    systemPrompt: '基础提示'
  }

  it('无覆盖参数时返回原配置引用', () => {
    const result = getStepConfig(baseConfig)
    expect(result).toBe(baseConfig)
  })

  it('覆盖 model', () => {
    const result = getStepConfig(baseConfig, 'claude-opus-4-6')
    expect(result.model).toBe('claude-opus-4-6')
    expect(result.maxTurns).toBe(30)
    expect(result.systemPrompt).toBe('基础提示')
  })

  it('覆盖 maxTurns', () => {
    const result = getStepConfig(baseConfig, undefined, 50)
    expect(result.maxTurns).toBe(50)
    expect(result.model).toBe('claude-sonnet-4-6')
  })

  it('同时覆盖 model 和 maxTurns', () => {
    const result = getStepConfig(baseConfig, 'claude-opus-4-6', 50)
    expect(result.model).toBe('claude-opus-4-6')
    expect(result.maxTurns).toBe(50)
  })

  it('不修改原配置', () => {
    getStepConfig(baseConfig, 'claude-opus-4-6', 50)
    expect(baseConfig.model).toBe('claude-sonnet-4-6')
    expect(baseConfig.maxTurns).toBe(30)
  })
})

// ========== buildAllowedTools ==========

describe('buildAllowedTools', () => {
  it('无基础工具时返回 MCP pattern', () => {
    const mcpServers: Record<string, McpServerConfig> = {
      myServer: { command: 'cmd' }
    }
    const result = buildAllowedTools(undefined, mcpServers, false)
    expect(result).toEqual(['mcp__myServer__*'])
  })

  it('基础工具 + MCP pattern 合并', () => {
    const mcpServers: Record<string, McpServerConfig> = {
      serverA: { command: 'cmdA' }
    }
    const result = buildAllowedTools(['Read', 'Write'], mcpServers, false)
    expect(result).toEqual(['Read', 'Write', 'mcp__serverA__*'])
  })

  it('有 Skills 时添加 Skill 工具', () => {
    const result = buildAllowedTools(['Read'], {}, true)
    expect(result).toContain('Skill')
  })

  it('无 Skills 时不添加 Skill 工具', () => {
    const result = buildAllowedTools(['Read'], {}, false)
    expect(result).not.toContain('Skill')
  })

  it('已有 Skill 时不重复添加', () => {
    const result = buildAllowedTools(['Skill', 'Read'], {}, true)
    expect(result.filter(t => t === 'Skill')).toHaveLength(1)
  })

  it('已有 MCP pattern 时不重复添加', () => {
    const mcpServers: Record<string, McpServerConfig> = {
      serverA: { command: 'cmdA' }
    }
    const result = buildAllowedTools(['mcp__serverA__*'], mcpServers, false)
    expect(result.filter(t => t === 'mcp__serverA__*')).toHaveLength(1)
  })

  it('多个 MCP 服务生成多个 pattern', () => {
    const mcpServers: Record<string, McpServerConfig> = {
      server1: { command: 'cmd1' },
      server2: { command: 'cmd2' }
    }
    const result = buildAllowedTools(undefined, mcpServers, false)
    expect(result).toEqual(['mcp__server1__*', 'mcp__server2__*'])
  })

  it('空 MCP + 无 Skills 时返回基础工具', () => {
    const result = buildAllowedTools(['Read', 'Write'], {}, false)
    expect(result).toEqual(['Read', 'Write'])
  })
})

// ========== handleDanglingReferences ==========

describe('handleDanglingReferences', () => {
  it('valid 时不调用回调', () => {
    const callback = vi.fn()
    const result: ReferenceValidationResult = {
      valid: true,
      missingMcpIds: [],
      missingSkillIds: []
    }
    handleDanglingReferences(result, callback)
    expect(callback).not.toHaveBeenCalled()
  })

  it('缺少 MCP 时调用回调', () => {
    const callback = vi.fn()
    const result: ReferenceValidationResult = {
      valid: false,
      missingMcpIds: ['mcp-1', 'mcp-2'],
      missingSkillIds: []
    }
    handleDanglingReferences(result, callback)
    expect(callback).toHaveBeenCalledOnce()
    expect(callback.mock.calls[0][0]).toContain('mcp-1')
    expect(callback.mock.calls[0][0]).toContain('mcp-2')
  })

  it('缺少 Skill 时调用回调', () => {
    const callback = vi.fn()
    const result: ReferenceValidationResult = {
      valid: false,
      missingMcpIds: [],
      missingSkillIds: ['skill-1']
    }
    handleDanglingReferences(result, callback)
    expect(callback).toHaveBeenCalledOnce()
    expect(callback.mock.calls[0][0]).toContain('skill-1')
  })

  it('MCP 和 Skill 都缺少时调用两次回调', () => {
    const callback = vi.fn()
    const result: ReferenceValidationResult = {
      valid: false,
      missingMcpIds: ['mcp-1'],
      missingSkillIds: ['skill-1']
    }
    handleDanglingReferences(result, callback)
    expect(callback).toHaveBeenCalledTimes(2)
  })

  it('无回调时不报错', () => {
    const result: ReferenceValidationResult = {
      valid: false,
      missingMcpIds: ['mcp-1'],
      missingSkillIds: []
    }
    expect(() => handleDanglingReferences(result)).not.toThrow()
  })
})
