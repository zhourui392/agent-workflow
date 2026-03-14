/**
 * 执行器工具函数单元测试
 *
 * @author zhourui(V33215020)
 * @since 2026/03/14
 */

import { describe, it, expect } from 'vitest'
import { extractText, truncate, extractToolResults } from '../src/main/execution/infrastructure/ClaudeAgentExecutor'

// ========== extractText ==========

describe('extractText', () => {
  it('字符串内容直接返回', () => {
    expect(extractText('hello world')).toBe('hello world')
  })

  it('ContentBlock 数组提取 text 类型', () => {
    const content = [
      { type: 'text', text: 'first ' },
      { type: 'text', text: 'second' }
    ]
    expect(extractText(content)).toBe('first second')
  })

  it('过滤非 text 类型的 block', () => {
    const content = [
      { type: 'text', text: 'keep' },
      { type: 'tool_use', id: '1', name: 'Read', input: {} },
      { type: 'text', text: ' this' }
    ]
    expect(extractText(content)).toBe('keep this')
  })

  it('空数组返回空字符串', () => {
    expect(extractText([])).toBe('')
  })

  it('null 返回空字符串', () => {
    expect(extractText(null)).toBe('')
  })

  it('undefined 返回空字符串', () => {
    expect(extractText(undefined)).toBe('')
  })

  it('数字返回空字符串', () => {
    expect(extractText(42)).toBe('')
  })

  it('数组中包含 null 元素时跳过', () => {
    const content = [
      null,
      { type: 'text', text: 'valid' },
      undefined
    ]
    expect(extractText(content)).toBe('valid')
  })
})

// ========== truncate ==========

describe('truncate', () => {
  it('短字符串不截断', () => {
    expect(truncate('hello', 10)).toBe('hello')
  })

  it('刚好等于长度不截断', () => {
    expect(truncate('12345', 5)).toBe('12345')
  })

  it('超过长度截断并加省略号', () => {
    expect(truncate('hello world', 5)).toBe('hello...')
  })

  it('空字符串不截断', () => {
    expect(truncate('', 10)).toBe('')
  })

  it('截断长度为0', () => {
    expect(truncate('hello', 0)).toBe('...')
  })
})

// ========== extractToolResults ==========

describe('extractToolResults', () => {
  it('非数组内容返回空数组', () => {
    const map = new Map<string, string>()
    expect(extractToolResults('string', map, 0)).toEqual([])
    expect(extractToolResults(null, map, 0)).toEqual([])
  })

  it('提取 tool_result 事件', () => {
    const toolNameMap = new Map([['tool-1', 'Read']])
    const content = [
      {
        type: 'tool_result',
        tool_use_id: 'tool-1',
        content: 'file content here'
      }
    ]
    const results = extractToolResults(content, toolNameMap, 2)
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      type: 'tool_result',
      toolUseId: 'tool-1',
      toolName: 'Read',
      output: 'file content here',
      isError: false,
      turnIndex: 2
    })
  })

  it('未知 tool_use_id 使用 unknown 作为工具名', () => {
    const toolNameMap = new Map<string, string>()
    const content = [
      { type: 'tool_result', tool_use_id: 'unknown-id', content: 'output' }
    ]
    const results = extractToolResults(content, toolNameMap, 0)
    expect(results[0].toolName).toBe('unknown')
  })

  it('数组格式的 content 提取 text 块', () => {
    const toolNameMap = new Map([['t1', 'Bash']])
    const content = [
      {
        type: 'tool_result',
        tool_use_id: 't1',
        content: [
          { type: 'text', text: 'line1' },
          { type: 'text', text: 'line2' }
        ]
      }
    ]
    const results = extractToolResults(content, toolNameMap, 0)
    expect(results[0].output).toBe('line1\nline2')
  })

  it('is_error 标记传递', () => {
    const toolNameMap = new Map([['t1', 'Bash']])
    const content = [
      {
        type: 'tool_result',
        tool_use_id: 't1',
        content: 'error output',
        is_error: true
      }
    ]
    const results = extractToolResults(content, toolNameMap, 0)
    expect(results[0].isError).toBe(true)
  })

  it('超长输出被截断到 2000 字符', () => {
    const toolNameMap = new Map([['t1', 'Read']])
    const longContent = 'x'.repeat(3000)
    const content = [
      { type: 'tool_result', tool_use_id: 't1', content: longContent }
    ]
    const results = extractToolResults(content, toolNameMap, 0)
    expect(results[0].output.length).toBe(2003) // 2000 + '...'
    expect(results[0].output.endsWith('...')).toBe(true)
  })

  it('跳过非 tool_result 类型的块', () => {
    const toolNameMap = new Map<string, string>()
    const content = [
      { type: 'text', text: 'hello' },
      { type: 'tool_use', id: '1', name: 'Read' }
    ]
    const results = extractToolResults(content, toolNameMap, 0)
    expect(results).toHaveLength(0)
  })
})
