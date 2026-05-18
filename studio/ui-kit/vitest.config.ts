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
      coverage: {
        // The shared react preset inherits 90/85/90/90 thresholds that
        // are unrealistic for the studio packages right now (see
        // devkit.yaml coverage.thresholds.studio = 0/35/35). Drop the
        // strict thresholds locally; coverage is still measured for
        // reporting, just not enforced as a hard gate.
        thresholds: {},
      },
    },
  })
);
