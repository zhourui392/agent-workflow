/**
 * 工具图标映射
 *
 * @author zhourui(V33215020)
 * @since 2026/03/14
 */

const TOOL_ICON_MAP: Record<string, string> = {
  Read: '\uD83D\uDCD6',
  Write: '\uD83D\uDCDD',
  Edit: '\u270F\uFE0F',
  Bash: '\uD83D\uDCBB',
  Grep: '\uD83D\uDD0D',
  Glob: '\uD83D\uDCC2',
  WebSearch: '\uD83C\uDF10',
  WebFetch: '\uD83C\uDF10',
  Agent: '\uD83E\uDD16',
}

const DEFAULT_TOOL_ICON = '\uD83D\uDD27'

/**
 * 获取工具对应的图标
 *
 * @param toolName 工具名称
 * @returns 图标字符
 */
export function getToolIcon(toolName: string): string {
  return TOOL_ICON_MAP[toolName] || DEFAULT_TOOL_ICON
}
