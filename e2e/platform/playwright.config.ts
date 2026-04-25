import { defineConfig } from '@playwright/test'
import path from 'path'

// Each domain writes its own checklist into report/CHECKLIST.md
process.env.CHECKLIST_OUT ??= path.join(__dirname, 'report', 'CHECKLIST.md')

export default defineConfig({
  testDir: './specs',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'report', open: 'never' }],
    ['@kb-labs/e2e-shared/reporter.js'],
  ],
  use: { actionTimeout: 10_000 },
})
