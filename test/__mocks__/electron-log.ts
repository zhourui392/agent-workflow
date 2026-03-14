/**
 * electron-log mock（测试环境）
 *
 * @author zhourui(V33215020)
 * @since 2026/03/14
 */

const noop = () => {}

const log = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  verbose: noop,
  silly: noop
}

export default log
