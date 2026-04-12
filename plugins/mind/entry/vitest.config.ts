import { defineConfig } from 'vitest/config';
import cfg from '@kb-labs/devkit/vitest/node';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(__dirname, './src');
const contractsDir = resolve(__dirname, '../contracts/src');

export default defineConfig({
  ...cfg,
  test: {
    ...cfg.test,
    coverage: {
      ...cfg.test?.coverage,
      thresholds: {
        lines: 75,
        functions: 60,
        branches: 50,
        statements: 75,
      },
    },
  },
  resolve: {
    alias: [
      { find: '@app/cli', replacement: resolve(srcDir, 'cli/index.ts') },
      { find: '@app/cli/', replacement: resolve(srcDir, 'cli') + '/' },
      { find: '@app/application', replacement: resolve(srcDir, 'application/index.ts') },
      { find: '@app/application/', replacement: resolve(srcDir, 'application') + '/' },
      { find: '@kb-labs/mind-contracts', replacement: resolve(contractsDir, 'index.ts') },
      { find: '@kb-labs/mind-contracts/', replacement: contractsDir + '/' },
      { find: '@app/rest', replacement: resolve(srcDir, 'rest/index.ts') },
      { find: '@app/rest/', replacement: resolve(srcDir, 'rest') + '/' },
      { find: '@app/infra', replacement: resolve(srcDir, 'infra/index.ts') },
      { find: '@app/infra/', replacement: resolve(srcDir, 'infra') + '/' },
      { find: '@app/shared', replacement: resolve(srcDir, 'shared/index.ts') },
      { find: '@app/shared/', replacement: resolve(srcDir, 'shared') + '/' },
      { find: '@app/studio', replacement: resolve(srcDir, 'studio/index.ts') },
      { find: '@app/studio/', replacement: resolve(srcDir, 'studio') + '/' },
    ],
  },
});
