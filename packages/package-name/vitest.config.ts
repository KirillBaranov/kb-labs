import { defineConfig } from 'vitest/config'
import nodePreset from '@kb-labs/devkit/vitest/node.js'

export default defineConfig({
  ...nodePreset,
  test: {
    ...nodePreset.test,
    include: ['tests/**/*.test.ts'],
    coverage: {
      ...(nodePreset.test?.coverage || {}),
      exclude: ['**/dist/**', '**/tests/**'],
      reportsDirectory: 'coverage'
    }
  }
})
