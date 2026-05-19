import { test, expect } from '@playwright/test'
import { spawnCliCommand, spawnCliJson } from '@kb-labs/sdk/e2e'

// CLI journey tests for `kb workflow health`
// Verifies that the command connects to the running daemon and reports status.

test('CJ-H01: kb workflow health exits 0 and prints status', async () => {
  const result = await spawnCliCommand(['workflow', 'health'])
  expect(result.exitCode).toBe(0)
  // Output should mention ok/healthy/workflow — daemon is running
  expect(result.stdout + result.stderr).toMatch(/ok|health|workflow/i)
})

test('CJ-H02: kb workflow health --json returns { ok: true }', async () => {
  const data = await spawnCliJson<{ ok: boolean; data?: unknown }>(['workflow', 'health', '--json'])
  expect(data.ok).toBe(true)
})
