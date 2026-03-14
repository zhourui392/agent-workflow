/**
 * 日期格式化工具
 *
 * @author zhourui(V33215020)
 * @since 2026/03/14
 */

/**
 * 格式化日期字符串为本地化展示
 *
 * @param dateStr ISO 日期字符串
 * @returns 格式化后的日期，无值时返回 '-'
 */
export function formatDate(dateStr?: string): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN')
}

/**
 * 将秒数格式化为人类可读的时长
 *
 * @param totalSeconds 总秒数
 * @returns 格式化时长字符串
 */
export function formatSeconds(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`
  if (totalSeconds < 3600) return `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`
  return `${Math.floor(totalSeconds / 3600)}h ${Math.floor((totalSeconds % 3600) / 60)}m`
}

/**
 * 计算两个时间点之间的时长并格式化
 *
 * @param start 开始时间 ISO 字符串
 * @param end 结束时间 ISO 字符串，为空时使用 fallbackNow
 * @param fallbackNow 当 end 为空时使用的当前时间戳（支持响应式）
 * @returns 格式化时长字符串
 */
export function formatDuration(start?: string, end?: string, fallbackNow?: number): string {
  if (!start) return '-'
  const s = new Date(start).getTime()
  const e = end ? new Date(end).getTime() : (fallbackNow ?? Date.now())
  const sec = Math.round((e - s) / 1000)
  return formatSeconds(sec)
}

/**
 * 将毫秒数格式化为人类可读的时长
 *
 * @param ms 毫秒数
 * @returns 格式化时长字符串
 */
export function formatDurationMs(ms: number): string {
  return formatSeconds(Math.round(ms / 1000))
}
