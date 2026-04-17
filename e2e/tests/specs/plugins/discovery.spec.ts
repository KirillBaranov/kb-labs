import { test, expect } from '@playwright/test'
import { GATEWAY, REST } from '../../fixtures/urls.js'

test('P-01: gateway /hosts returns registered host list', async ({ request }) => {
  const res = await request.get(`${GATEWAY}/hosts`)
  expect(res.status()).toBe(200)
  expect(Array.isArray(await res.json())).toBe(true)
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
