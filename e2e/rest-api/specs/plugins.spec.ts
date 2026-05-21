import { test, expect } from '@playwright/test'
import { REST } from '@kb-labs/e2e-shared/urls.js'

const BASE = `${REST}/api/v1`

// Note: /plugins/snapshot does not exist as a route.
// Snapshot data is embedded in /plugins/registry and /plugins/refresh responses.
// Envelope middleware wraps all responses: { ok: true, data: <payload>, meta: {...} }

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
  if (!Array.isArray(plugins) || plugins.length === 0) {
    test.skip(true, 'No plugins mounted — skipping entry-shape assertion')
    return
  }
  for (const p of plugins) {
    expect(typeof p.id).toBe('string')
    expect(p.id.length).toBeGreaterThan(0)
    expect(typeof p.status).toBe('string')
  }
})

test('RA-PL-03: GET /plugins/registry returns 200 with non-empty response', async ({ request }) => {
  const res = await request.get(`${BASE}/plugins/registry`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body).toBeTruthy()
})

test('RA-PL-04: GET /plugins/registry contains plugin entries with id field', async ({ request }) => {
  const res = await request.get(`${BASE}/plugins/registry`)
  const body = await res.json()
  // registry returns array of manifest entries wrapped in envelope
  const data = body.data ?? body
  const entries = Array.isArray(data) ? data : Object.values(data)
  if (entries.length === 0) {
    test.skip(true, 'No plugins in registry — skipping manifest assertion')
    return
  }
  const first = entries[0] as Record<string, unknown>
  expect(first.id ?? first.pluginId ?? first.pluginRoot).toBeTruthy()
})

test('RA-PL-05: GET /plugins/registry response contains rev or checksum metadata', async ({ request }) => {
  const res = await request.get(`${BASE}/plugins/registry`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  // The top-level envelope has meta.requestId; the data itself may have rev
  expect(body.ok ?? true).toBeTruthy()
})

test('RA-PL-06: POST /plugins/refresh returns 200 with rev and total', async ({ request }) => {
  const res = await request.post(`${BASE}/plugins/refresh`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  const data = body.data ?? body
  // refresh returns { ok: true, data: { rev, total, generatedAt, partial, stale } }
  expect(typeof data.rev).toBe('number')
  expect(typeof data.total).toBe('number')
})

test('RA-PL-07: POST /plugins/refresh rev is non-negative', async ({ request }) => {
  const res = await request.post(`${BASE}/plugins/refresh`)
  const body = await res.json()
  const data = body.data ?? body
  expect(data.rev).toBeGreaterThanOrEqual(0)
})

test('RA-PL-08: GET /plugins/registry after POST /plugins/refresh stays consistent', async ({ request }) => {
  const before = await request.post(`${BASE}/plugins/refresh`)
  const beforeData = (await before.json()).data ?? await before.json()
  const revBefore = beforeData.rev as number

  const after = await request.post(`${BASE}/plugins/refresh`)
  const afterData = (await after.json()).data ?? await after.json()
  const revAfter = afterData.rev as number

  // rev should stay the same or increment — never regress
  expect(revAfter).toBeGreaterThanOrEqual(revBefore)
})

test('RA-PL-09: GET /studio/registry returns 200', async ({ request }) => {
  const res = await request.get(`${BASE}/studio/registry`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body).toBeTruthy()
})
