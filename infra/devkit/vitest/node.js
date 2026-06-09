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
    // The first test in an import-heavy suite pays the cold ESM transform +
    // module-graph load. Under the forks pool on a CPU-constrained CI runner
    // that occasionally spikes past Vitest's 5s default and flakes a healthy
    // test (e.g. one whose body does `await import('../heavy-module.js')`).
    // 30s gives generous headroom for cold-start latency while still catching a
    // genuine hang; logic-level slowness is not a concern for these unit suites.
    testTimeout: 30_000,
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
        '**/*.config.js',
        '**/bootstrap.ts',
        '**/bin.ts'
      ],
      thresholds: {}
    }
  }
})
