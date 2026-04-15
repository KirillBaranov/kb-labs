import { defineConfig, mergeConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import baseConfig from '@kb-labs/devkit/vitest/react.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [react()],
    test: {
      setupFiles: ['./vitest-setup.ts'],
      // React Testing Library + jsdom bootstrap can exceed the 5s vitest
      // default on slow CI runners before the first test body executes.
      testTimeout: 20_000,
    },
  })
);
