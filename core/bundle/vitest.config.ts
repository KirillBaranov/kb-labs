import { defineConfig } from 'vitest/config'
import nodePreset from '@kb-labs/devkit/vitest/node'

export default defineConfig({
  ...nodePreset,
  test: {
    ...nodePreset.test,
    coverage: {
      ...nodePreset.test?.coverage,
      exclude: [
        '**/dist/**',
        '**/fixtures/**',
        '**/__tests__/**',
        '**/*.spec.*',
        '**/*.test.*',
        // non-source and config files
        'eslint.config.js',
        '**/vitest.config.ts',
        '**/tsup.config.ts',
        '**/tsconfig*.json',
        // barrel files / types
        '**/index.ts',
        '**/types.ts',
        '**/types/**',
      ],
    },
    server: {
      deps: {
        // Inline picomatch to avoid ESM/CommonJS resolution issues
        inline: ['picomatch', '@kb-labs/core-config'],
        // Exclude dist files from transformation
        external: [],
      },
    },
  },
  resolve: {
    conditions: ['import', 'module', 'node', 'default'],
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
  },
})
