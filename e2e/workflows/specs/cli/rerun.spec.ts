import { test, expect } from '@playwright/test'
import { spawnCliCommand, spawnCliJson } from '@kb-labs/sdk/e2e'
import { WORKFLOW } from '@kb-labs/sdk/e2e'

// CLI journey tests for `kb workflow runs rerun <runId>`
// Creates a completed run, then reruns it and verifies a new runId is returned.

let completedRunId: string | undefined

test.beforeAll(async ({ request }) => {
  const catalogRes = await request.get(`${WORKFLOW}/api/v1/workflows`)
  const catalog = await catalogRes.json()
  const workflows: Array<{ id?: string; name?: string }> =
    catalog.data?.workflows ?? catalog.data ?? catalog.workflows ?? []
  const wf = workflows.find((w) => (w.name ?? w.id) === 'e2e-hello') ?? workflows[0]
  if (!wf) return

  const id = wf.id ?? wf.name!
  const runRes = await request.post(`${WORKFLOW}/api/v1/workflows/${id}/runs`, { data: {} })
  const runBody = await runRes.json()
  const runId: string = runBody.data?.runId ?? runBody.data?.id ?? runBody.runId
  if (!runId) return

  // Wait for terminal state so rerun is against a finished run (max 30s)
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const s = await request.get(`${WORKFLOW}/api/v1/runs/${runId}`)
    const b = await s.json()
    const status: string = b.data?.run?.status ?? b.data?.status ?? ''
    if (/success|completed|failed|cancelled|dlq/.test(status)) {
      completedRunId = runId
      break
    }
    await new Promise((r) => setTimeout(r, 1_000))
  }
})

test('CJ-RR-01: kb workflow runs rerun <runId> --json returns a new runId', async () => {
  test.skip(!completedRunId, 'No completed run available for rerun')

  const data = await spawnCliJson<{ ok: boolean; data: { runId: string } }>(
    ['workflow', 'runs', 'rerun', completedRunId!, '--json'],
  )
  expect(data.ok).toBe(true)
  expect(data.data.runId).toBeTruthy()
  // New run must have a different ID
  expect(data.data.runId).not.toBe(completedRunId)
})

test('CJ-RR-02: rerun nonexistent runId exits 1', async () => {
  const result = await spawnCliCommand([
    'workflow', 'runs', 'rerun', 'nonexistent-run-id-xyz',
  ])
  expect(result.exitCode).toBe(1)
})
