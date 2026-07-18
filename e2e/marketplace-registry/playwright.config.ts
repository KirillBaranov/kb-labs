import { defineConfig } from '@playwright/test'
import path from 'path'

process.env.CHECKLIST_OUT ??= path.join(__dirname, 'report', 'CHECKLIST.md')
process.env.FLAKY_REPORT_OUT ??= path.join(__dirname, 'flaky-report.json')

export default defineConfig({
  testDir: './scenarios',
  testMatch: '**/cases/**/*.spec.ts',
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'report', open: 'never' }],
    ['@kb-labs/e2e-shared/reporter.js'],
    ['@kb-labs/e2e-shared/flaky-reporter.js', { suite: 'marketplace-registry' }],
  ],
  use: { actionTimeout: 10_000 },
})
