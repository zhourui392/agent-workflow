/**
 * 执行状态显示工具
 *
 * @author zhourui(V33215020)
 * @since 2026/03/14
 */

const STATUS_TYPE_MAP: Record<string, string> = {
  success: 'success',
  failed: 'danger',
  running: 'primary',
  pending: 'info',
  timeout: 'warning'
}

const STATUS_LABEL_MAP: Record<string, string> = {
  success: '成功',
  failed: '失败',
  running: '运行中',
  pending: '等待中',
  timeout: '超时'
}

/**
 * 获取状态对应的 Element Plus Tag 类型
 *
 * @param status 执行状态
 * @returns Element Plus tag type
 */
export function statusType(status: string): string {
  return STATUS_TYPE_MAP[status] || 'info'
}

/**
 * 获取状态对应的中文标签
 *
 * @param status 执行状态
 * @returns 中文标签
 */
export function statusLabel(status: string): string {
  return STATUS_LABEL_MAP[status] || status
}

/**
 * 获取时间线节点类型（不含 timeout）
 *
 * @param status 执行状态
 * @returns Element Plus timeline type
 */
export function timelineType(status: string): string {
  const map: Record<string, string> = {
    success: 'success',
    failed: 'danger',
    running: 'primary',
    pending: 'info'
  }
  return map[status] || 'info'
}
