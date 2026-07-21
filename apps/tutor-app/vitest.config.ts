import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@framework': resolve(__dirname, 'src/lib/cubism-framework')
    }
  },
  test: {
    environment: 'jsdom',
    globals: true
  }
})
