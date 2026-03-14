import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts']
  },
  resolve: {
    alias: {
      'electron-log': path.resolve(__dirname, 'test/__mocks__/electron-log.ts'),
      'electron': path.resolve(__dirname, 'test/__mocks__/electron.ts')
    }
  }
})
