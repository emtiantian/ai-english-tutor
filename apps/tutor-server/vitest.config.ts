import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@tests': resolve(__dirname, 'tests')
    }
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'coverage'],
    setupFiles: ['tests/setup.ts'],
    pool: 'forks',
    minWorkers: 1,
    maxWorkers: 4,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts']
    },
    typecheck: {
      enabled: false,
      tsconfig: './tsconfig.test.json'
    }
  }
})
