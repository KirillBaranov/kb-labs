import { defineConfig } from 'vitest/config';
import baseConfig from '@kb-labs/devkit/vitest/node';

const contractsDir = new URL('../impact-contracts/src/', import.meta.url).pathname;

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],
  },
  resolve: {
    alias: {
      '@kb-labs/impact-contracts': contractsDir + 'index.ts',
      '@kb-labs/impact-contracts/*': contractsDir + '*',
    },
  },
});
