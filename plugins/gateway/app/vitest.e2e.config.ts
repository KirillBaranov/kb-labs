import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/__tests__/*.e2e.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // Run e2e test files sequentially — all share a single gateway instance
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
  },
});
