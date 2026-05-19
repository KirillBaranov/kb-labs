import { test, expect } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { spawnCliCommand } from '@kb-labs/sdk/e2e'
import { WORKFLOW } from '@kb-labs/sdk/e2e'

// CLI journey tests for `kb workflow runs watch <runId>`
// Verifies that the command streams events and exits with correct code.

async function createRun(
  request: APIRequestContext,
  workflowName: string,
): Promise<string | undefined> {
  const catalogRes = await request.get(`${WORKFLOW}/api/v1/workflows`)
  const catalog = await catalogRes.json()
  const workflows: Array<{ id?: string; name?: string }> =
    catalog.data?.workflows ?? catalog.data ?? catalog.workflows ?? []
  const wf = workflows.find((w) => (w.name ?? w.id) === workflowName)
  if (!wf) return undefined
  const id = wf.id ?? wf.name!
  const runRes = await request.post(`${WORKFLOW}/api/v1/workflows/${id}/runs`, { data: {} })
  const body = await runRes.json()
  return body.data?.runId ?? body.data?.id ?? body.runId
}

test('CJ-RW-01: kb workflow runs watch exits 0 when run.finished', async ({ request }) => {
  const runId = await createRun(request, 'e2e-hello')
  test.skip(!runId, 'e2e-hello workflow not found in catalog')

  // watch streams until run terminal — e2e-hello completes quickly
  const result = await spawnCliCommand(
    ['workflow', 'runs', 'watch', runId!],
    { timeoutMs: 35_000 },
  )
  expect(result.exitCode).toBe(0)
})

test('CJ-RW-02: kb workflow runs watch exits 1 when run fails', async ({ request }) => {
  const runId = await createRun(request, 'e2e-fail')
  test.skip(!runId, 'e2e-fail workflow not found in catalog')

  const result = await spawnCliCommand(
    ['workflow', 'runs', 'watch', runId!],
    { timeoutMs: 35_000 },
  )
  expect(result.exitCode).toBe(1)
})

test('CJ-RW-03: kb workflow runs watch --json emits JSON events per line', async ({ request }) => {
  const runId = await createRun(request, 'e2e-hello')
  test.skip(!runId, 'e2e-hello workflow not found in catalog')

  const result = await spawnCliCommand(
    ['workflow', 'runs', 'watch', runId!, '--json'],
    { timeoutMs: 35_000 },
  )
  expect(result.exitCode).toBe(0)

  // Each non-empty line of stdout must be valid JSON
  const lines = result.stdout.split('\n').filter((l) => l.trim())
  expect(lines.length).toBeGreaterThan(0)
  for (const line of lines) {
    expect(() => JSON.parse(line)).not.toThrow()
  }
})

test('CJ-RW-04: missing runId exits 1 with error', async () => {
  const result = await spawnCliCommand(['workflow', 'runs', 'watch'])
  expect(result.exitCode).toBe(1)
})
