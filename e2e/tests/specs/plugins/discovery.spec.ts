import { test, expect } from '@playwright/test'
import { GATEWAY, REST } from '../../fixtures/urls.js'

test('P-01: gateway /hosts endpoint is registered (auth required)', async ({ request }) => {
  const res = await request.get(`${GATEWAY}/hosts`)
  // 401 = endpoint exists and auth is enforced (correct behavior)
  // 200 = endpoint accessible (no auth in this environment)
  expect([200, 401]).toContain(res.status())
  expect(res.status()).not.toBe(404) // must be a registered route
})

test('P-02: rest-api /api/v1/routes lists registered routes', async ({ request }) => {
  const res = await request.get(`${REST}/api/v1/routes`)
  expect(res.status()).toBe(200)
})

test('P-03: unknown gateway route returns 404 not 500', async ({ request }) => {
  const res = await request.get(`${GATEWAY}/this-does-not-exist-e2e`)
  expect(res.status()).toBe(404)
})

test('P-04: plugin commands appear in kb --help', async () => { test.skip(true, 'not yet implemented') })
test('P-05: plugin manifest loads without errors', async () => { test.skip(true, 'not yet implemented') })
