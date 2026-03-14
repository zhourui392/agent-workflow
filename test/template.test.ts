/**
 * 模板引擎单元测试
 *
 * @author zhourui(V33215020)
 * @since 2026/03/14
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderTemplate, extractVariables, validateTemplate } from '../src/main/core/template'

describe('renderTemplate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 14, 10, 30, 45)) // 2026-03-14 10:30:45
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('替换内置变量 {{today}}', () => {
    const result = renderTemplate('今天是 {{today}}')
    expect(result).toBe('今天是 2026-03-14')
  })

  it('替换内置变量 {{yesterday}}', () => {
    const result = renderTemplate('昨天是 {{yesterday}}')
    expect(result).toBe('昨天是 2026-03-13')
  })

  it('替换内置变量 {{now}}', () => {
    const result = renderTemplate('现在是 {{now}}')
    expect(result).toBe('现在是 2026-03-14 10:30:45')
  })

  it('替换上下文输入变量 {{inputs.xxx}}', () => {
    const context = { inputs: { name: 'Alice', age: 30 } }
    const result = renderTemplate('Hello {{inputs.name}}, age {{inputs.age}}', context)
    expect(result).toBe('Hello Alice, age 30')
  })

  it('替换步骤输出变量 {{steps.step1.output}}', () => {
    const context = {
      steps: { step1: { output: '分析完成' } }
    }
    const result = renderTemplate('上一步结果: {{steps.step1.output}}', context)
    expect(result).toBe('上一步结果: 分析完成')
  })

  it('未定义变量保留原始占位符', () => {
    const result = renderTemplate('值是 {{undefined_var}}')
    expect(result).toBe('值是 {{undefined_var}}')
  })

  it('对象值序列化为JSON', () => {
    const context = {
      inputs: { config: { key: 'value' } }
    }
    const result = renderTemplate('配置: {{inputs.config}}', context)
    expect(result).toBe('配置: {"key":"value"}')
  })

  it('变量名两侧允许空格', () => {
    const context = { inputs: { name: 'Bob' } }
    const result = renderTemplate('{{ inputs.name }}', context)
    expect(result).toBe('Bob')
  })

  it('无变量模板原样返回', () => {
    const result = renderTemplate('普通文本，没有变量')
    expect(result).toBe('普通文本，没有变量')
  })

  it('空字符串模板返回空', () => {
    const result = renderTemplate('')
    expect(result).toBe('')
  })

  it('null 值变量保留原始占位符', () => {
    const context = { inputs: { empty: null } }
    const result = renderTemplate('值: {{inputs.empty}}', context)
    expect(result).toBe('值: {{inputs.empty}}')
  })

  it('同一模板中混合多种变量类型', () => {
    const context = {
      inputs: { user: 'Alice' },
      steps: { analyze: { output: 'OK' } }
    }
    const result = renderTemplate(
      '{{today}} {{inputs.user}} {{steps.analyze.output}} {{missing}}',
      context
    )
    expect(result).toBe('2026-03-14 Alice OK {{missing}}')
  })
})

describe('extractVariables', () => {
  it('提取所有变量名', () => {
    const vars = extractVariables('{{today}} and {{inputs.name}} and {{steps.s1.output}}')
    expect(vars).toEqual(['today', 'inputs.name', 'steps.s1.output'])
  })

  it('去重同名变量', () => {
    const vars = extractVariables('{{today}} {{today}} {{today}}')
    expect(vars).toEqual(['today'])
  })

  it('无变量模板返回空数组', () => {
    const vars = extractVariables('no variables here')
    expect(vars).toEqual([])
  })

  it('处理带空格的变量名', () => {
    const vars = extractVariables('{{ inputs.name }}')
    expect(vars).toEqual(['inputs.name'])
  })

  it('空字符串返回空数组', () => {
    const vars = extractVariables('')
    expect(vars).toEqual([])
  })
})

describe('validateTemplate', () => {
  it('内置变量不报告为未解析', () => {
    const unresolved = validateTemplate('{{today}} {{yesterday}} {{now}}')
    expect(unresolved).toEqual([])
  })

  it('上下文中存在的变量不报告', () => {
    const context = { inputs: { name: 'test' } }
    const unresolved = validateTemplate('{{inputs.name}}', context)
    expect(unresolved).toEqual([])
  })

  it('返回未解析的变量列表', () => {
    const unresolved = validateTemplate('{{inputs.missing}} and {{steps.s1.output}}')
    expect(unresolved).toEqual(['inputs.missing', 'steps.s1.output'])
  })

  it('混合有效和无效变量', () => {
    const context = { inputs: { name: 'test' } }
    const unresolved = validateTemplate('{{today}} {{inputs.name}} {{inputs.age}}', context)
    expect(unresolved).toEqual(['inputs.age'])
  })

  it('无变量模板返回空数组', () => {
    const unresolved = validateTemplate('no variables')
    expect(unresolved).toEqual([])
  })
})
