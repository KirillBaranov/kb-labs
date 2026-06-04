import { defineConfig } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Each domain writes its own checklist into report/CHECKLIST.md
process.env.CHECKLIST_OUT ??= path.join(__dirname, 'report', 'CHECKLIST.md')

export default defineConfig({
  testDir: './scenarios',
  testMatch: '**/cases/**/*.spec.ts',
  // A real-embedder bench indexes a corpus over the network — give it room.
  timeout: 120_000,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'report', open: 'never' }],
    ['@kb-labs/e2e-shared/reporter.js'],
  ],
  use: { actionTimeout: 30_000 },
})
