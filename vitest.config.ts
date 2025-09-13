import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: [
      'packages/**/src/**/*.spec.ts',
      'packages/**/src/**/*.test.ts',
    ],
    environment: 'node',
    testTimeout: 20000,

    coverage: {
      provider: 'v8',
      all: true,
      reportsDirectory: './coverage',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        statements: 60,
        lines: 60,
        branches: 72,
        functions: 79,
      },
      exclude: [
        '**/dist/**',
        '**/fixtures/**',
        '**/__tests__/**',
        '**/*.spec.*',
        '**/*.test.*',
      ],
    },
  },
})
