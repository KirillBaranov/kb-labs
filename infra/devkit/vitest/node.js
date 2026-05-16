import { defineConfig } from 'vitest/config'
import { cpus } from 'os'

const defaultForks = Math.max(1, Math.ceil(cpus().length / 2))
const maxForks = process.env.VITEST_MAX_FORKS
  ? parseInt(process.env.VITEST_MAX_FORKS, 10)
  : defaultForks

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    reporters: ['default'],
    pool: 'forks',
    poolOptions: {
      forks: { maxForks, minForks: 1 },
    },
    include: ['**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**'
    ],
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
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90
      }
    }
  }
})
