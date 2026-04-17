import { test, expect } from '@playwright/test'
import { GATEWAY } from '../../fixtures/urls.js'

// Gateway auth applies only to gateway-owned routes (hosts, etc.), not to
// proxied upstreams. Tests verify auth enforcement on gateway's own endpoints.

test('GW-01: invalid token on gateway route → 401', async ({ request }) => {
  const res = await request.get(`${GATEWAY}/hosts`, {
    headers: { Authorization: 'Bearer invalid-token-e2e' },
  })
  expect(res.status()).toBe(401)
})

test('GW-02: missing token on gateway protected route → 401', async ({ request }) => {
  const res = await request.get(`${GATEWAY}/hosts`)
  expect([401, 403]).toContain(res.status())
})

test('GW-03: auth/token endpoint exists and rejects bad credentials', async ({ request }) => {
  const res = await request.post(`${GATEWAY}/auth/token`, {
    data: { username: 'notexist', password: 'wrong' },
  })
  expect([400, 401, 403, 422]).toContain(res.status())
})

test('GW-04: /health is public (no auth required)', async ({ request }) => {
  const res = await request.get(`${GATEWAY}/health`)
  expect(res.status()).toBe(200)
})

test('GW-05: valid token → request passes through to upstream', async () => { test.skip(true, 'not yet implemented') })
test('GW-06: expired token → 401 with refresh hint', async () => { test.skip(true, 'not yet implemented') })
test('GW-07: auth/register → auth/token → authenticated request succeeds', async () => { test.skip(true, 'not yet implemented') })
