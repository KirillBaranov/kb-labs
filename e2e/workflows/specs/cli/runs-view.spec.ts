import { test, expect } from '@playwright/test'
import { spawnCliCommand, spawnCliJson } from '@kb-labs/sdk/e2e'
import { WORKFLOW } from '@kb-labs/sdk/e2e'

// CLI journey tests for `kb workflow runs view <runId>`
// Creates a run in beforeAll and inspects it via CLI.

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

  // Wait for terminal state (max 30s)
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const statusRes = await request.get(`${WORKFLOW}/api/v1/runs/${runId}`)
    const statusBody = await statusRes.json()
    const status: string = statusBody.data?.run?.status ?? statusBody.data?.status ?? ''
    if (/success|completed|failed|cancelled|dlq/.test(status)) {
      completedRunId = runId
      break
    }
    await new Promise((r) => setTimeout(r, 1_000))
  }
})

test('CJ-RV-01: kb workflow runs view <runId> exits 0', async () => {
  test.skip(!completedRunId, 'No completed run available')
  const result = await spawnCliCommand(['workflow', 'runs', 'view', completedRunId!])
  expect(result.exitCode).toBe(0)
})

test('CJ-RV-02: kb workflow runs view <runId> --json=all returns run detail', async () => {
  test.skip(!completedRunId, 'No completed run available')

  const result = await spawnCliCommand([
    'workflow', 'runs', 'view', completedRunId!, '--json=all',
  ])
  expect(result.exitCode).toBe(0)
  const data = JSON.parse(result.stdout)
  expect(data.ok).toBe(true)
  // Run detail must include id and status
  const run = data.data?.run ?? data.data ?? data
  expect(run).toMatchObject({
    id: completedRunId,
    status: expect.stringMatching(/success|completed|failed|cancelled|dlq/),
  })
})

test('CJ-RV-03: nonexistent runId exits 1', async () => {
  const result = await spawnCliCommand([
    'workflow', 'runs', 'view', 'nonexistent-run-id-xyz',
  ])
  expect(result.exitCode).toBe(1)
})

test('CJ-RV-04: kb workflow runs view <runId> --log exits 0', async () => {
  test.skip(!completedRunId, 'No completed run available')
  const result = await spawnCliCommand([
    'workflow', 'runs', 'view', completedRunId!, '--log',
  ])
  expect(result.exitCode).toBe(0)
})
