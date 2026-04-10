import { defineConfig } from 'vitest/config';
import baseConfig from '@kb-labs/devkit/vitest/node.js';

const sharedDir = new URL('./src/shared/', import.meta.url).pathname;
const domainDir = new URL('./src/domain/', import.meta.url).pathname;
const applicationDir = new URL('./src/application/', import.meta.url).pathname;
const infraDir = new URL('./src/infra/', import.meta.url).pathname;
const contractsDir = new URL('../contracts/src/', import.meta.url).pathname;

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    globals: true,
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.spec.ts']
  },
  resolve: {
    alias: {
      '@kb-labs/plugin-template-contracts': contractsDir + 'index.ts',
      '@kb-labs/plugin-template-contracts/*': contractsDir + '*',
      '@app/shared': sharedDir + 'index.ts',
      '@app/shared/*': sharedDir + '*',
      '@app/domain': domainDir + 'index.ts',
      '@app/domain/*': domainDir + '*',
      '@app/application': applicationDir + 'index.ts',
      '@app/application/*': applicationDir + '*',
      '@app/infra': infraDir + 'index.ts',
      '@app/infra/*': infraDir + '*'
    }
  }
});
