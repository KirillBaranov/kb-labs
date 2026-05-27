import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from '../../vitest.config.js';

// pnpm workspace symlinks cause vite:import-analysis to read a stale/published
// package.json for @kb-labs/* packages that may not yet include new subpath
// exports. Marking all workspace packages as external makes Vite skip its
// import-analysis and lets Node.js resolve them natively via the exports map.
export default mergeConfig(baseConfig, defineConfig({
  test: {
    exclude: ['**/*.e2e.test.ts', '**/node_modules/**'],
    server: {
      deps: {
        external: [/^@kb-labs\//],
      },
    },
  },
}));
