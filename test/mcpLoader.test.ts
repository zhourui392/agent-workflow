/**
 * MCP Server 配置加载测试
 *
 * 测试 parseMcpJsonFile 对 .mcp.json 文件的解析逻辑。
 */

import { describe, it, expect, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { parseMcpJsonFile } from '../src/main/configuration/infrastructure/CliConfigLoader'

const tmpDir = path.join(os.tmpdir(), 'mcp-loader-test-' + Date.now())

function writeTmpJson(filename: string, content: unknown): string {
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
  const filePath = path.join(tmpDir, filename)
  fs.writeFileSync(filePath, JSON.stringify(content), 'utf-8')
  return filePath
}

afterEach(() => {
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

describe('parseMcpJsonFile', () => {
  it('解析标准 stdio MCP server 配置', () => {
    const filePath = writeTmpJson('.mcp.json', {
      mcpServers: {
        playwright: {
          command: 'npx',
          args: ['-y', '@anthropic-ai/mcp-server-playwright'],
          env: { DISPLAY: ':0' }
        }
      }
    })
    const result = parseMcpJsonFile(filePath)
    expect(result).toEqual({
      playwright: {
        command: 'npx',
        args: ['-y', '@anthropic-ai/mcp-server-playwright'],
        env: { DISPLAY: ':0' }
      }
    })
  })

  it('解析多个 MCP server', () => {
    const filePath = writeTmpJson('.mcp.json', {
      mcpServers: {
        playwright: { command: 'npx', args: ['-y', 'server-playwright'] },
        github: { command: 'npx', args: ['-y', 'server-github'], env: { GITHUB_TOKEN: 'tok' } }
      }
    })
    const result = parseMcpJsonFile(filePath)
    expect(Object.keys(result)).toEqual(['playwright', 'github'])
    expect(result.github.env).toEqual({ GITHUB_TOKEN: 'tok' })
  })

  it('仅 command 字段的最小配置', () => {
    const filePath = writeTmpJson('.mcp.json', {
      mcpServers: { simple: { command: '/usr/bin/my-mcp' } }
    })
    const result = parseMcpJsonFile(filePath)
    expect(result).toEqual({ simple: { command: '/usr/bin/my-mcp' } })
  })

  it('跳过缺少 command 的条目', () => {
    const filePath = writeTmpJson('.mcp.json', {
      mcpServers: {
        valid: { command: 'npx' },
        invalid: { args: ['foo'] }
      }
    })
    const result = parseMcpJsonFile(filePath)
    expect(Object.keys(result)).toEqual(['valid'])
  })

  it('跳过非对象的条目', () => {
    const filePath = writeTmpJson('.mcp.json', {
      mcpServers: {
        valid: { command: 'npx' },
        str: 'not-an-object',
        num: 42,
        nil: null
      }
    })
    const result = parseMcpJsonFile(filePath)
    expect(Object.keys(result)).toEqual(['valid'])
  })

  it('env 中过滤非字符串值', () => {
    const filePath = writeTmpJson('.mcp.json', {
      mcpServers: {
        test: { command: 'cmd', env: { KEY: 'val', NUM: 123, OBJ: {} } }
      }
    })
    const result = parseMcpJsonFile(filePath)
    expect(result.test.env).toEqual({ KEY: 'val' })
  })

  it('文件不存在时返回空对象', () => {
    const result = parseMcpJsonFile('/nonexistent/path/.mcp.json')
    expect(result).toEqual({})
  })

  it('无 mcpServers 字段时返回空对象', () => {
    const filePath = writeTmpJson('.mcp.json', { otherKey: 'value' })
    const result = parseMcpJsonFile(filePath)
    expect(result).toEqual({})
  })

  it('无效 JSON 时返回空对象', () => {
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
    const filePath = path.join(tmpDir, 'bad.json')
    fs.writeFileSync(filePath, '{invalid json', 'utf-8')
    const result = parseMcpJsonFile(filePath)
    expect(result).toEqual({})
  })

  it('args 非字符串数组时忽略', () => {
    const filePath = writeTmpJson('.mcp.json', {
      mcpServers: {
        test: { command: 'cmd', args: [1, 2, 3] }
      }
    })
    const result = parseMcpJsonFile(filePath)
    expect(result.test.args).toBeUndefined()
  })
})
