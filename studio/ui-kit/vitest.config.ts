import { defineConfig, mergeConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import baseConfig from '@kb-labs/devkit/vitest/react.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [react()],
    test: {
      setupFiles: ['./vitest-setup.ts'],
    },
  })
);
