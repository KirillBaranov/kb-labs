import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from '../../vitest.config.js';

// Vite 7 + pnpm workspace links cannot resolve the adapters/testing subpath
// export via the package exports map (vite:import-analysis fails). Using
// test.alias to map the import directly to the TypeScript source file so that
// vite processes it natively, bypassing the broken subpath resolution.
const corePlatformTesting = new URL(
  '../../../core/platform/src/adapters/testing/index.ts',
  import.meta.url,
).pathname;

export default mergeConfig(baseConfig, defineConfig({
  test: {
    alias: {
      '@kb-labs/core-platform/adapters/testing': corePlatformTesting,
    },
    exclude: ['**/*.e2e.test.ts', '**/node_modules/**'],
    testTimeout: 15000,
  },
}));
