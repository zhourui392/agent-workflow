import { ElMessage } from 'element-plus'

/**
 * 从未知错误中提取可读消息
 */
export function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  return '未知错误'
}

/**
 * 显示操作失败提示（带具体操作名称）
 */
export function showError(action: string, e: unknown): void {
  const msg = getErrorMessage(e)
  ElMessage.error(`${action}失败：${msg}`)
}
