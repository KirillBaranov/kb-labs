import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './specs',
  timeout: 30_000,
  retries: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'report', open: 'never' }],
    ['./reporters/checklist-reporter.ts'],
  ],
  projects: [
    { name: 'services',     testMatch: 'specs/services/**/*.spec.ts' },
    { name: 'platform',     testMatch: 'specs/platform/**/*.spec.ts' },
    { name: 'gateway',      testMatch: 'specs/gateway/**/*.spec.ts' },
    { name: 'marketplace',  testMatch: 'specs/marketplace/**/*.spec.ts' },
    { name: 'workflows',    testMatch: 'specs/workflows/**/*.spec.ts' },
    { name: 'studio',       testMatch: 'specs/studio/**/*.spec.ts' },
    { name: 'adapters',     testMatch: 'specs/adapters/**/*.spec.ts' },
    { name: 'plugins',      testMatch: 'specs/plugins/**/*.spec.ts' },
  ],
  // Run studio realtime tests with longer timeout — WS/SSE connections need time
  use: { actionTimeout: 10_000 },
})
