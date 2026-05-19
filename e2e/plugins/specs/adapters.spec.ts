import { test, expect } from '@playwright/test'
import { REST } from '@kb-labs/e2e-shared/urls.js'

// All adapter analytics endpoints return 200 with data or 501 ANALYTICS_NOT_IMPLEMENTED.
// A non-404 response means the adapter is registered and the route is mounted.

test('A-01: LLM adapter registered in REST API', async ({ request }) => {
  const res = await request.get(`${REST}/api/v1/adapters/llm/usage`)
  expect([200, 501]).toContain(res.status())
  const body = await res.json()
  if (res.status() === 200) {
    expect(body.ok).toBe(true)
    expect(typeof body.data.totalRequests).toBe('number')
  } else {
    expect(body.error?.code).toBe('ANALYTICS_NOT_IMPLEMENTED')
  }
})

test('A-02: storage adapter registered', async ({ request }) => {
  const res = await request.get(`${REST}/api/v1/adapters/storage/usage`)
  expect([200, 501]).toContain(res.status())
  const body = await res.json()
  if (res.status() === 200) {
    expect(body.ok).toBe(true)
    // Storage returns readOperations/writeOperations (not totalRequests)
    expect(typeof body.data.readOperations).toBe('number')
  } else {
    expect(body.error?.code).toBe('ANALYTICS_NOT_IMPLEMENTED')
  }
})

test('A-03: LLM adapter responds to a real completion request', async () => {
  test.skip(true, 'requires LLM API key — not available in CI')
})
