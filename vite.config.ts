/**
 * Vite配置 - 渲染进程构建
 *
 * @author zhourui(V33215020)
 * @since 2026/03/11
 */

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  plugins: [vue()],
  root: 'src/renderer',
  base: './',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      '@main': path.resolve(__dirname, 'src/main'),
      '@api': path.resolve(__dirname, 'src/renderer/api')
    }
  },
  server: {
    port: 5173
  }
});
