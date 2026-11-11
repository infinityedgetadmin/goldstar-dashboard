import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    // Playwright specs (Plan 3 T6) are NOT vitest tests — without this
    // exclude, `npm test` hard-crashes loading e2e/*.spec.ts
    // ("Playwright Test did not expect test.describe() to be called here").
    exclude: ['**/node_modules/**', '**/e2e/**'],
    setupFiles: './src/test/setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})