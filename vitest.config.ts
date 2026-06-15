import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['electron/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['./electron/agent-core/__tests__/setup.ts'],
  },
})
