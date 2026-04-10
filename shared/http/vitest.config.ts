import { defineConfig } from 'vitest/config';
import nodePreset from '@kb-labs/devkit/vitest/node.js';

export default defineConfig({
  ...nodePreset,
  test: {
    ...nodePreset.test,
    coverage: {
      ...nodePreset.test?.coverage,
      enabled: false,
    },
  },
});
