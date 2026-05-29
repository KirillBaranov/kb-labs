import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '../../..');

export default defineConfig({
  resolve: {
    alias: {
      '@/': path.resolve(__dirname, 'src') + '/',
      // Point workspace packages to their local built dist so pnpm virtual store
      // version staleness doesn't affect tests.
      '@kb-labs/core-contracts': path.resolve(workspaceRoot, 'core/contracts/dist/index.js'),
    },
  },
  test: {
    // Default environment for non-DOM tests (http-client, utils, etc.)
    environment: 'node',
    // Per-file override: any file under __tests__/**/*.tsx or *.component.test.ts
    // can use `// @vitest-environment jsdom` at the top.
    environmentMatchGlobs: [
      ['**/__tests__/**/*.tsx', 'jsdom'],
      ['**/*.component.test.tsx', 'jsdom'],
    ],
    globals: false,
    setupFiles: ['./vitest-setup.ts'],
  },
});
