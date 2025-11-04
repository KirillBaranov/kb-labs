import { defineConfig } from 'vitest/config'
import nodePreset from '@kb-labs/devkit/vitest/node.js'

export default defineConfig({
  ...nodePreset,
  test: {
    ...nodePreset.test,
    globals: true,
    include: [
      'packages/**/src/**/*.spec.ts',
      'packages/**/src/**/*.test.ts',
    ],
    testTimeout: 20000,
    coverage: {
      ...(nodePreset.test?.coverage || {}),
      all: true,
      reportsDirectory: './coverage',
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
