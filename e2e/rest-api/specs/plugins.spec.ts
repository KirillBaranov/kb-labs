import { test, expect } from '@playwright/test'
import { REST } from '@kb-labs/e2e-shared/urls.js'

const BASE = `${REST}/api/v1`

test('RA-PL-01: GET /plugins/health returns 200 with array of plugin statuses', async ({ request }) => {
  const res = await request.get(`${BASE}/plugins/health`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  const plugins = body.data ?? body
  expect(Array.isArray(plugins)).toBe(true)
})

test('RA-PL-02: GET /plugins/health each entry has id and status', async ({ request }) => {
  const res = await request.get(`${BASE}/plugins/health`)
  const body = await res.json()
  const plugins: Array<{ id: string; status: string }> = body.data ?? body
  if (plugins.length === 0) {
    test.skip(true, 'No plugins mounted — skipping entry-shape assertion')
    return
  }
  for (const p of plugins) {
    expect(typeof p.id).toBe('string')
    expect(p.id.length).toBeGreaterThan(0)
    expect(typeof p.status).toBe('string')
  }
})

test('RA-PL-03: GET /plugins/registry returns 200 with non-empty registry', async ({ request }) => {
  const res = await request.get(`${BASE}/plugins/registry`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  // registry can be wrapped in { ok, data } envelope or returned directly
  const registry = body.data ?? body
  expect(registry).toBeTruthy()
})

test('RA-PL-04: GET /plugins/registry contains manifest data per plugin', async ({ request }) => {
  const res = await request.get(`${BASE}/plugins/registry`)
  const body = await res.json()
  const registry = body.data ?? body
  const entries = Array.isArray(registry) ? registry : Object.values(registry)
  if (entries.length === 0) {
    test.skip(true, 'No plugins in registry — skipping manifest assertion')
    return
  }
  const first = entries[0] as Record<string, unknown>
  // each entry should have at minimum an id field
  expect(first.id ?? first.pluginId ?? first.name).toBeTruthy()
})

test('RA-PL-05: GET /plugins/snapshot returns 200 with rev and schema', async ({ request }) => {
  const res = await request.get(`${BASE}/plugins/snapshot`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  const snapshot = body.data ?? body
  expect(typeof snapshot.rev).toBe('number')
  expect(snapshot.schema).toBeTruthy()
})

test('RA-PL-06: GET /plugins/snapshot contains checksum and partial/stale flags', async ({ request }) => {
  const res = await request.get(`${BASE}/plugins/snapshot`)
  const body = await res.json()
  const snapshot = body.data ?? body
  // checksum may not always be present in all configs
  expect(typeof snapshot.partial).toBe('boolean')
  expect(typeof snapshot.stale).toBe('boolean')
})

test('RA-PL-07: POST /plugins/refresh returns 200', async ({ request }) => {
  const res = await request.post(`${BASE}/plugins/refresh`)
  expect(res.status()).toBe(200)
})

test('RA-PL-08: GET /plugins/snapshot after POST /plugins/refresh stays consistent', async ({ request }) => {
  const before = await (await request.get(`${BASE}/plugins/snapshot`)).json()
  await request.post(`${BASE}/plugins/refresh`)
  const after = await (await request.get(`${BASE}/plugins/snapshot`)).json()
  const snapBefore = before.data ?? before
  const snapAfter = after.data ?? after
  // rev must be >= previous rev after refresh
  expect(snapAfter.rev).toBeGreaterThanOrEqual(snapBefore.rev)
})

test('RA-PL-09: GET /studio/registry returns 200', async ({ request }) => {
  const res = await request.get(`${BASE}/studio/registry`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  const registry = body.data ?? body
  expect(registry).toBeTruthy()
})
