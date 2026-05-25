import { test, expect } from '@playwright/test'
import { GATEWAY } from '@kb-labs/e2e-shared/urls.js'
import { getAccessToken } from '@kb-labs/e2e-shared/auth.js'

test('GW-EX-01: POST /api/v1/execute without token returns 401', async ({ request }) => {
  const res = await request.post(`${GATEWAY}/api/v1/execute`, {
    data: { handlerRef: 'test#default', input: {} },
  })
  expect([401, 403]).toContain(res.status())
})

test('GW-EX-02: POST /api/v1/execute with invalid handlerRef returns 4xx', async ({ request }) => {
  const token = await getAccessToken(request)
  const res = await request.post(`${GATEWAY}/api/v1/execute`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { handlerRef: 'nonexistent-handler-xyz#default', input: {} },
  })
  // Must return a client error, not a server crash
  expect(res.status()).toBeGreaterThanOrEqual(400)
  expect(res.status()).toBeLessThan(500)
})

test('GW-EX-03: POST /api/v1/execute/:id/cancel with unknown id returns 404 or 410', async ({ request }) => {
  const token = await getAccessToken(request)
  const res = await request.post(`${GATEWAY}/api/v1/execute/nonexistent-exec-id/cancel`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {},
  })
  expect([404, 410]).toContain(res.status())
})
