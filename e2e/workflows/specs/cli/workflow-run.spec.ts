import { test, expect } from '@playwright/test'
import { spawnCliCommand, spawnCliJson } from '@kb-labs/sdk/e2e'
import { WORKFLOW } from '@kb-labs/sdk/e2e'

// CLI journey tests for `kb workflow run --workflow-id=<id>`
// Requires the e2e-hello workflow to be registered in the daemon catalog.

let helloWorkflowId: string | undefined

test.beforeAll(async ({ request }) => {
  const res = await request.get(`${WORKFLOW}/api/v1/workflows`)
  const body = await res.json()
  const workflows: Array<{ id?: string; name?: string }> =
    body.data?.workflows ?? body.data ?? body.workflows ?? []
  const wf = workflows.find((w) => (w.name ?? w.id) === 'e2e-hello') ?? workflows[0]
  helloWorkflowId = wf?.id ?? wf?.name
})

test('CJ-WR-01: kb workflow run --workflow-id=<id> --json returns runId', async () => {
  test.skip(!helloWorkflowId, 'No workflow found in catalog')

  const data = await spawnCliJson<{ ok: boolean; data: { runId: string; status: string } }>(
    ['workflow', 'run', `--workflow-id=${helloWorkflowId}`, '--json'],
  )
  expect(data.ok).toBe(true)
  expect(data.data.runId).toBeTruthy()
  expect(data.data.status).toMatch(/queued|pending|running/)
})

test('CJ-WR-02: missing --workflow-id exits 1 with error', async () => {
  const result = await spawnCliCommand(['workflow', 'run'])
  expect(result.exitCode).toBe(1)
  expect(result.stdout + result.stderr).toMatch(/workflow-id/i)
})

test('CJ-WR-03: invalid --isolation exits 1', async () => {
  test.skip(!helloWorkflowId, 'No workflow found in catalog')

  const result = await spawnCliCommand([
    'workflow', 'run',
    `--workflow-id=${helloWorkflowId}`,
    '--isolation=invalid-value',
  ])
  expect(result.exitCode).toBe(1)
})

test('CJ-WR-04: --json output can be piped (stdout is valid JSON)', async () => {
  test.skip(!helloWorkflowId, 'No workflow found in catalog')

  const result = await spawnCliCommand([
    'workflow', 'run',
    `--workflow-id=${helloWorkflowId}`,
    '--json',
  ])
  expect(result.exitCode).toBe(0)
  // Must be parseable JSON on stdout (nothing mixed in from stderr)
  expect(() => JSON.parse(result.stdout)).not.toThrow()
})
