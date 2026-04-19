/**
 * 跨平台命令解析器测试
 *
 * Windows 下 child_process.spawn 默认不会解析 .cmd/.bat shim，
 * 直接 spawn('npx') 会抛 ENOENT。resolveSpawnCommand 在 Windows 下
 * 为无扩展名命令追加 .cmd，其他平台原样返回。
 */

import { describe, it, expect } from 'vitest'
import { resolveSpawnCommand, prepareStdioSpawn } from '../src/main/configuration/infrastructure/commandResolver'

describe('resolveSpawnCommand', () => {
  it('Windows 下无扩展名命令追加 .cmd', () => {
    expect(resolveSpawnCommand('npx', 'win32')).toBe('npx.cmd')
    expect(resolveSpawnCommand('npm', 'win32')).toBe('npm.cmd')
  })

  it('Windows 下已有可执行扩展名保持原样', () => {
    expect(resolveSpawnCommand('node.exe', 'win32')).toBe('node.exe')
    expect(resolveSpawnCommand('python.exe', 'win32')).toBe('python.exe')
    expect(resolveSpawnCommand('run.bat', 'win32')).toBe('run.bat')
    expect(resolveSpawnCommand('tool.cmd', 'win32')).toBe('tool.cmd')
  })

  it('Windows 下绝对/相对路径保持原样', () => {
    expect(resolveSpawnCommand('C:\\tools\\my-mcp.exe', 'win32')).toBe('C:\\tools\\my-mcp.exe')
    expect(resolveSpawnCommand('./bin/server', 'win32')).toBe('./bin/server')
    expect(resolveSpawnCommand('/usr/local/bin/node', 'win32')).toBe('/usr/local/bin/node')
  })

  it('Linux 下原样返回', () => {
    expect(resolveSpawnCommand('npx', 'linux')).toBe('npx')
    expect(resolveSpawnCommand('node', 'linux')).toBe('node')
  })

  it('macOS 下原样返回', () => {
    expect(resolveSpawnCommand('npx', 'darwin')).toBe('npx')
  })

  it('大小写不敏感的扩展名识别', () => {
    expect(resolveSpawnCommand('Tool.CMD', 'win32')).toBe('Tool.CMD')
    expect(resolveSpawnCommand('App.EXE', 'win32')).toBe('App.EXE')
  })
})

describe('prepareStdioSpawn', () => {
  it('非 Windows 不启用 shell，command/args 原样传递', () => {
    const result = prepareStdioSpawn('npx', ['-y', '@a/b'], 'linux')
    expect(result).toEqual({ command: 'npx', args: ['-y', '@a/b'], shell: false })
  })

  it('Windows 下 .cmd shim 启用 shell，简单 args 不加引号（cmd 会把引号透传给子进程）', () => {
    const result = prepareStdioSpawn('npx', ['-y', '@a/b'], 'win32')
    expect(result.shell).toBe(true)
    expect(result.command).toBe('npx.cmd')
    expect(result.args).toEqual(['-y', '@a/b'])
  })

  it('Windows 下 .exe 不需要 shell', () => {
    const result = prepareStdioSpawn('node.exe', ['server.js'], 'win32')
    expect(result).toEqual({ command: 'node.exe', args: ['server.js'], shell: false })
  })

  it('Windows 下路径形式的 .cmd 也启用 shell', () => {
    const result = prepareStdioSpawn('C:\\tools\\my.cmd', ['run'], 'win32')
    expect(result.shell).toBe(true)
    expect(result.command).toBe('C:\\tools\\my.cmd')
  })

  it('Windows 下含空格的 arg 才需要引号', () => {
    const result = prepareStdioSpawn('npx', ['--msg', 'hello world'], 'win32')
    expect(result.args).toEqual(['--msg', '"hello world"'])
  })

  it('Windows 下 arg 含双引号时转义并包围', () => {
    const result = prepareStdioSpawn('npx', ['hi "w"'], 'win32')
    expect(result.args[0]).toBe('"hi \\"w\\""')
  })

  it('Windows 下 arg 含 cmd 元字符时加引号并转义 %', () => {
    const result = prepareStdioSpawn('npx', ['a&b', 'c|d', 'e%f'], 'win32')
    expect(result.args).toEqual(['"a&b"', '"c|d"', '"e%%f"'])
  })

  it('Windows 下含空格的 command 才需要引号', () => {
    const result = prepareStdioSpawn('C:\\Program Files\\tool.cmd', [], 'win32')
    expect(result.command).toBe('"C:\\Program Files\\tool.cmd"')
  })
})
