/**
 * electron mock（测试环境）
 *
 * @author zhourui(V33215020)
 * @since 2026/03/14
 */

import { vi } from 'vitest'

export const app = {
  isPackaged: false,
  getPath: (name: string) => `/mock/${name}`,
  getVersion: () => '1.0.0'
}

const mockWebContents = {
  send: vi.fn()
}

const mockWindow = {
  isDestroyed: () => false,
  webContents: mockWebContents
}

export const BrowserWindow = {
  getAllWindows: () => [mockWindow]
}

export const ipcMain = {
  handle: vi.fn()
}
