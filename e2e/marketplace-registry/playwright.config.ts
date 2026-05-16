import { defineConfig } from '@playwright/test'
import path from 'path'

process.env.CHECKLIST_OUT ??= path.join(__dirname, 'report', 'CHECKLIST.md')

export default defineConfig({
  testDir: './specs',
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'report', open: 'never' }],
  ],
  use: { actionTimeout: 10_000 },
})
