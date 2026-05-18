import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    reporters: ['default'],
    include: ['**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**'
    ],
    setupFiles: ['./vitest-setup.ts'],
    coverage: {
      enabled: false,
      provider: 'v8',
      all: true,
      reportsDirectory: './coverage',
      reporter: ['text', 'json', 'lcov'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/__tests__/**',
        '**/*.d.ts',
        '**/types.ts',
        '**/types/**',
        '**/contracts.ts',
        '**/contracts/**',
        '**/constants.ts',
        '**/constants/**',
        '**/*.config.ts',
        '**/*.config.js'
      ],
      // No global thresholds in the preset — enforce per-package via
      // devkit.yaml coverage.categories/thresholds (current floors,
      // raised quarterly). The previous 90/85/90/90 values broke every
      // consumer that wasn't already at target, with no migration path.
      thresholds: {}
    }
  }
})

