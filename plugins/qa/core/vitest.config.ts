import { defineConfig } from 'vitest/config';
import baseConfig from '@kb-labs/devkit/vitest/node';

const contractsDir = new URL('../contracts/src/', import.meta.url).pathname;

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    globals: true,
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
  },
  resolve: {
    alias: {
      '@kb-labs/qa-contracts': contractsDir + 'index.ts',
    },
  },
});
