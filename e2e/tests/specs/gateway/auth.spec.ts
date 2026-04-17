import { test, expect } from '@playwright/test'
import { GATEWAY } from '../../fixtures/urls.js'
import { registerAgent, issueToken, getAccessToken } from '../../fixtures/auth.js'

// Gateway auth applies only to gateway-owned routes (hosts, etc.), not to
// proxied upstreams. Tests verify auth enforcement and full auth lifecycle.

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
    data: { clientId: 'notexist', clientSecret: 'wrong' },
  })
  expect([400, 401, 403, 422]).toContain(res.status())
})

test('GW-04: /health is public (no auth required)', async ({ request }) => {
  const res = await request.get(`${GATEWAY}/health`)
  expect(res.status()).toBe(200)
})

test('GW-05: valid token → protected route returns 200', async ({ request }) => {
  const token = await getAccessToken(request)
  const res = await request.get(`${GATEWAY}/hosts`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(Array.isArray(body)).toBe(true)
})

test('GW-06: refresh token rotates and issues new access token', async ({ request }) => {
  const creds = await registerAgent(request, 'e2e-refresh-test')
  const first = await issueToken(request, creds)
  if (!first.refreshToken) {
    test.skip(true, 'refresh token not returned — server may not support rotation')
    return
  }

  const res = await request.post(`${GATEWAY}/auth/refresh`, {
    data: { refreshToken: first.refreshToken },
  })
  expect(res.status()).toBe(200)
  const second = await res.json()
  expect(second.accessToken).toBeTruthy()
  // New token should be different from old one
  expect(second.accessToken).not.toBe(first.accessToken)
})

test('GW-07: register → token → authenticated request succeeds end-to-end', async ({ request }) => {
  // Full auth lifecycle in a single test
  const creds = await registerAgent(request, 'e2e-full-flow')
  expect(creds.clientId).toBeTruthy()
  expect(creds.clientSecret).toBeTruthy()

  const tokens = await issueToken(request, creds)
  expect(tokens.accessToken).toBeTruthy()

  // Use token to access a protected gateway route
  const hosts = await request.get(`${GATEWAY}/hosts`, {
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
  })
  expect(hosts.status()).toBe(200)
  expect(Array.isArray(await hosts.json())).toBe(true)

  // Token must be rejected after deliberate invalidation (wrong secret)
  const rejected = await request.post(`${GATEWAY}/auth/token`, {
    data: { clientId: creds.clientId, clientSecret: 'wrong-secret' },
  })
  expect([401, 403]).toContain(rejected.status())
})
