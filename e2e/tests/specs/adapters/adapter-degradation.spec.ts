import { test, expect } from '@playwright/test'
import { GATEWAY, REST } from '../../fixtures/urls.js'

// Verifies graceful adapter degradation: slots not configured in kb.config.json
// fall back to InMemory (working) or NoOp (throw AdapterUnavailableError).
// Shape: AdapterSlotStatus[] — [{ slot, mode, implementation, reason?, recordedAt }]

test('AD-01: GET /health/adapters returns 200 with an array', async ({ request }) => {
  const res = await request.get(`${GATEWAY}/health/adapters`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(Array.isArray(body)).toBe(true)
})

test('AD-02: each adapter status entry has required fields', async ({ request }) => {
  const res = await request.get(`${GATEWAY}/health/adapters`)
  expect(res.status()).toBe(200)
  const statuses: unknown[] = await res.json()
  expect(statuses.length).toBeGreaterThan(0)
  for (const entry of statuses) {
    const s = entry as Record<string, unknown>
    expect(typeof s['slot']).toBe('string')
    expect(['real', 'inmemory', 'noop']).toContain(s['mode'])
    expect(typeof s['implementation']).toBe('string')
    expect(typeof s['recordedAt']).toBe('string')
  }
})

test('AD-03: llm slot is noop when not configured', async ({ request }) => {
  const res = await request.get(`${GATEWAY}/health/adapters`)
  expect(res.status()).toBe(200)
  const statuses: { slot: string; mode: string; reason?: string }[] = await res.json()
  const llm = statuses.find(s => s.slot === 'llm')

  // Skip must come before assertions — otherwise an absent llm entry causes a
  // TypeError crash rather than a clean skip signal.
  test.skip(!llm, 'llm slot not present in status registry')

  // llm has no honest fallback — must be noop when not configured
  expect(llm!.mode).toBe('noop')
  expect(llm!.reason).toBe('not-configured')
})

test('AD-04: cache slot is inmemory or real (never noop)', async ({ request }) => {
  const res = await request.get(`${GATEWAY}/health/adapters`)
  expect(res.status()).toBe(200)
  const statuses: { slot: string; mode: string }[] = await res.json()
  const cache = statuses.find(s => s.slot === 'cache')
  if (!cache) return
  // cache always has a working fallback — InMemoryCache or a real adapter
  expect(['inmemory', 'real']).toContain(cache.mode)
})

test('AD-05: /health/adapters is public — no auth required', async ({ request }) => {
  // Must return 200 without Authorization header
  const res = await request.get(`${GATEWAY}/health/adapters`)
  expect(res.status()).not.toBe(401)
  expect(res.status()).not.toBe(403)
  expect(res.status()).toBe(200)
})

test('AD-06: all slots in the registry have a known mode', async ({ request }) => {
  const res = await request.get(`${GATEWAY}/health/adapters`)
  expect(res.status()).toBe(200)
  const statuses: { slot: string; mode: string }[] = await res.json()
  const validModes = new Set(['real', 'inmemory', 'noop'])
  for (const s of statuses) {
    expect(validModes.has(s.mode),
      `slot "${s.slot}" has unexpected mode "${s.mode}"`).toBe(true)
  }
})

test('AD-07: LLM noop slot returns ADAPTER_UNAVAILABLE when called via REST API', async ({ request }) => {
  // Attempt to trigger an LLM-backed operation without a real LLM configured.
  // The platform must return a structured error, not a 500 crash.
  const res = await request.post(`${REST}/api/v1/llm/complete`, {
    data: { prompt: 'hello' },
  })
  // 404 = endpoint doesn't exist yet (skip), 4xx structured = expected
  test.skip(res.status() === 404, 'LLM complete endpoint not available in this environment')
  // Must NOT be a server crash
  expect(res.status()).toBeLessThan(500)
  if (res.status() >= 400 && res.status() < 500) {
    const body = await res.json().catch(() => null)
    if (body) {
      // When noop, gateway maps AdapterUnavailableError → structured error response
      const code: unknown = body.code ?? body.error?.code
      if (code) {
        expect(code).toBe('ADAPTER_UNAVAILABLE')
      }
    }
  }
})
