import preset from '@kb-labs/devkit/vitest/node';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  ...preset,
  test: {
    ...preset.test,
    include: [
      'src/**/*.spec.ts',
      'src/**/*.test.ts',
      'src/**/__tests__/**/*.spec.ts',
      'src/**/__tests__/**/*.test.ts',
    ],
  },
});
