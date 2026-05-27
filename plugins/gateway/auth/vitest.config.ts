import { defineConfig, mergeConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import path from 'path';
import baseConfig from '../../vitest.config.js';

// Resolve workspace root so we can alias the testing subpath export.
// Vite 7 + pnpm workspace links have a known issue where vite:import-analysis
// cannot resolve @kb-labs/core-platform/adapters/testing via the package.json
// exports map. Pointing directly at the source bypasses that resolution.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default mergeConfig(baseConfig, defineConfig({
  resolve: {
    alias: {
      '@kb-labs/core-platform/adapters/testing': path.resolve(
        __dirname,
        '../../../core/platform/src/adapters/testing/index.ts',
      ),
    },
  },
}));
