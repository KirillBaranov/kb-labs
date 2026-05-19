import { test, expect } from '@playwright/test'
import { spawnCliCommand, spawnCliJson } from '@kb-labs/sdk/e2e'
import { WORKFLOW } from '@kb-labs/sdk/e2e'

// CLI journey tests for `kb workflow runs list`
// Seeds at least one run via HTTP, then verifies CLI output.

test.beforeAll(async ({ request }) => {
  // Seed a run so the list is non-empty
  const catalogRes = await request.get(`${WORKFLOW}/api/v1/workflows`)
  const catalog = await catalogRes.json()
  const workflows: Array<{ id?: string; name?: string }> =
    catalog.data?.workflows ?? catalog.data ?? catalog.workflows ?? []
  const wf = workflows.find((w) => (w.name ?? w.id) === 'e2e-hello') ?? workflows[0]
  if (wf) {
    const id = wf.id ?? wf.name!
    await request.post(`${WORKFLOW}/api/v1/workflows/${id}/runs`, { data: {} })
  }
})

test('CJ-RL-01: kb workflow runs list exits 0', async () => {
  const result = await spawnCliCommand(['workflow', 'runs', 'list'])
  expect(result.exitCode).toBe(0)
})

test('CJ-RL-02: kb workflow runs list --json returns an array', async () => {
  const data = await spawnCliJson<{ ok: boolean; data: { runs?: unknown[] } | unknown[] }>(
    ['workflow', 'runs', 'list', '--json']
  )
  expect(data.ok).toBe(true)
  const runs = Array.isArray(data.data) ? data.data : (data.data as { runs?: unknown[] }).runs ?? []
  expect(Array.isArray(runs)).toBe(true)
})

test('CJ-RL-03: kb workflow runs list --limit 5 exits 0', async () => {
  const result = await spawnCliCommand(['workflow', 'runs', 'list', '--limit', '5'])
  expect(result.exitCode).toBe(0)
})

test('CJ-RL-04: kb workflow runs list --status success exits 0', async () => {
  const result = await spawnCliCommand(['workflow', 'runs', 'list', '--status', 'success'])
  expect(result.exitCode).toBe(0)
})
