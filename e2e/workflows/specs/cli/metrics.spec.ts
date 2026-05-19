import { test, expect } from '@playwright/test'
import { spawnCliCommand, spawnCliJson } from '@kb-labs/sdk/e2e'

// CLI journey tests for `kb workflow metrics`
// Verifies Prometheus/structured metrics output from the running daemon.

test('CJ-M01: kb workflow metrics exits 0', async () => {
  const result = await spawnCliCommand(['workflow', 'metrics'])
  expect(result.exitCode).toBe(0)
})

test('CJ-M02: kb workflow metrics --json returns runs and jobs counters', async () => {
  const data = await spawnCliJson<{ ok: boolean; data?: { runs?: unknown; jobs?: unknown } }>(
    ['workflow', 'metrics', '--json']
  )
  expect(data.ok).toBe(true)
  // Stats should have at minimum runs and jobs counter objects
  const metrics = data.data ?? data
  expect(metrics).toHaveProperty('runs')
  expect(metrics).toHaveProperty('jobs')
})
