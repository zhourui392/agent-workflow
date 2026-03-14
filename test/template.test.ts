/**
 * 模板引擎单元测试
 *
 * @author zhourui(V33215020)
 * @since 2026/03/14
 */

import { describe, it, expect } from 'vitest'
import { TemplateEngine } from '../src/main/execution/domain/service/TemplateEngine'

const engine = new TemplateEngine()
const renderTemplate = engine.render.bind(engine)
const extractVariables = engine.extractVariables.bind(engine)
const validateTemplate = engine.validate.bind(engine)

describe('renderTemplate', () => {
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

  it('替换中文步骤名变量 {{steps.分析数据.output}}', () => {
    const context = {
      steps: { '分析数据': { output: '数据分析完成' } }
    }
    const result = renderTemplate('结果: {{steps.分析数据.output}}', context)
    expect(result).toBe('结果: 数据分析完成')
  })

  it('替换连字符步骤名变量 {{steps.step-1.output}}', () => {
    const context = {
      steps: { 'step-1': { output: 'first done' } }
    }
    const result = renderTemplate('结果: {{steps.step-1.output}}', context)
    expect(result).toBe('结果: first done')
  })

  it('按索引取步骤输出 {{steps.0.output}}', () => {
    const context = {
      steps: { 'first-step': { output: 'indexed output' } }
    }
    const result = renderTemplate('结果: {{steps.0.output}}', context)
    expect(result).toBe('结果: indexed output')
  })

  it('同一模板中混合多种变量类型', () => {
    const context = {
      inputs: { user: 'Alice' },
      steps: { analyze: { output: 'OK' } }
    }
    const result = renderTemplate(
      '{{inputs.user}} {{steps.analyze.output}} {{missing}}',
      context
    )
    expect(result).toBe('Alice OK {{missing}}')
  })
})

describe('extractVariables', () => {
  it('提取所有变量名', () => {
    const vars = extractVariables('{{inputs.name}} and {{steps.s1.output}}')
    expect(vars).toEqual(['inputs.name', 'steps.s1.output'])
  })

  it('去重同名变量', () => {
    const vars = extractVariables('{{inputs.x}} {{inputs.x}} {{inputs.x}}')
    expect(vars).toEqual(['inputs.x'])
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

  it('提取含中文和连字符的变量名', () => {
    const vars = extractVariables('{{steps.分析数据.output}} {{steps.step-1.output}}')
    expect(vars).toEqual(['steps.分析数据.output', 'steps.step-1.output'])
  })
})

describe('validateTemplate', () => {
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
    const unresolved = validateTemplate('{{inputs.name}} {{inputs.age}}', context)
    expect(unresolved).toEqual(['inputs.age'])
  })

  it('无变量模板返回空数组', () => {
    const unresolved = validateTemplate('no variables')
    expect(unresolved).toEqual([])
  })

  it('含中文变量名可正确判断', () => {
    const context = { steps: { '分析数据': { output: 'done' } } }
    const unresolved = validateTemplate('{{steps.分析数据.output}}', context)
    expect(unresolved).toEqual([])
  })
})
