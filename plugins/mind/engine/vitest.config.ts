import config from "@kb-labs/devkit/vitest/node";
import { defineConfig } from 'vitest/config';

export default defineConfig({
  ...config,
  resolve: {
    ...config.resolve,
    alias: {
      ...config.resolve?.alias,
    },
  },
  test: {
    ...config.test,
    pool: 'threads',
    poolOptions: {
      threads: {
        maxThreads: 1,
        minThreads: 1,
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 10000,
    isolate: true,
    maxConcurrency: 1,
  },
});
