import { defineConfig } from 'vitest/config';
import cfg from '@kb-labs/devkit/vitest/node';

export default defineConfig({
  ...cfg,
  test: {
    ...cfg.test,
    coverage: {
      ...cfg.test?.coverage,
      thresholds: {
        lines: 80,
        functions: 70,
        branches: 70,
        statements: 80,
      },
    },
  },
});
