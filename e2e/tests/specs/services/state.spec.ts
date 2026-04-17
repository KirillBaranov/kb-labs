import { test, expect } from '@playwright/test'
import { STATE } from '../../fixtures/urls.js'

// State daemon: key-value store with TTL
// PUT /state/:key  { value, ttl? } → 204
// GET /state/:key               → 200 (value) | 404
// DELETE /state/:key            → 204

test('SD-01: PUT then GET returns stored value', async ({ request }) => {
  const key = `e2e-${Date.now()}`
  const value = { hello: 'world', ts: Date.now() }

  const put = await request.put(`${STATE}/state/${key}`, { data: { value } })
  expect(put.status()).toBe(204)

  const get = await request.get(`${STATE}/state/${key}`)
  expect(get.status()).toBe(200)
  const body = await get.json()
  expect(body).toEqual(value)
})

test('SD-02: DELETE removes the key (GET returns 404 after)', async ({ request }) => {
  const key = `e2e-del-${Date.now()}`
  await request.put(`${STATE}/state/${key}`, { data: { value: 'to-be-deleted' } })

  const del = await request.delete(`${STATE}/state/${key}`)
  expect(del.status()).toBe(204)

  const get = await request.get(`${STATE}/state/${key}`)
  expect(get.status()).toBe(404)
})

test('SD-03: GET on missing key returns 404', async ({ request }) => {
  const res = await request.get(`${STATE}/state/key-that-does-not-exist-e2e-${Date.now()}`)
  expect(res.status()).toBe(404)
})

test('SD-04: stored value can be overwritten', async ({ request }) => {
  const key = `e2e-overwrite-${Date.now()}`
  await request.put(`${STATE}/state/${key}`, { data: { value: 'first' } })
  await request.put(`${STATE}/state/${key}`, { data: { value: 'second' } })

  const get = await request.get(`${STATE}/state/${key}`)
  expect(await get.json()).toBe('second')
})

test('SD-05: TTL expires entry (1s TTL, checked after 1.5s)', async ({ request }) => {
  const key = `e2e-ttl-${Date.now()}`
  await request.put(`${STATE}/state/${key}`, { data: { value: 'ephemeral', ttl: 1 } })

  await new Promise(r => setTimeout(r, 1500))

  const get = await request.get(`${STATE}/state/${key}`)
  expect(get.status()).toBe(404)
})

test('SD-06: stats reflect stored entries', async ({ request }) => {
  const key = `e2e-stats-${Date.now()}`
  await request.put(`${STATE}/state/${key}`, { data: { value: 42 } })

  const stats = await request.get(`${STATE}/stats`)
  expect(stats.status()).toBe(200)
  const body = await stats.json()
  expect(typeof body.totalEntries).toBe('number')
  expect(body.totalEntries).toBeGreaterThan(0)
})

test('SD-07: clear with pattern removes matching keys', async ({ request }) => {
  const prefix = `e2e-clear-${Date.now()}`
  await request.put(`${STATE}/state/${prefix}-a`, { data: { value: 1 } })
  await request.put(`${STATE}/state/${prefix}-b`, { data: { value: 2 } })

  const clear = await request.post(`${STATE}/state/clear?pattern=${prefix}*`)
  expect(clear.status()).toBe(204)

  expect((await request.get(`${STATE}/state/${prefix}-a`)).status()).toBe(404)
  expect((await request.get(`${STATE}/state/${prefix}-b`)).status()).toBe(404)
})
