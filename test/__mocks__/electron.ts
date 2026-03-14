/**
 * electron mock（测试环境）
 *
 * @author zhourui(V33215020)
 * @since 2026/03/14
 */

export const app = {
  isPackaged: false,
  getPath: (name: string) => `/mock/${name}`,
  getVersion: () => '1.0.0'
}
