import { test, expect } from '@playwright/test'
import { GATEWAY } from '../../fixtures/urls.js'

// Verifies the adapter degradation status surface used by `kb-dev doctor`.
// `kb-dev doctor` reads GET /health/adapters from the running gateway and
// renders a table of slot → mode → implementation → reason.
// These tests exercise the same HTTP endpoint to confirm the data is correct.

test('DOC-01: gateway /health/adapters returns adapter table', async ({ request }) => {
  const res = await request.get(`${GATEWAY}/health/adapters`)
  expect(res.status()).toBe(200)
  const statuses: { slot: string; mode: string; implementation: string }[] = await res.json()
  // At minimum the platform must report something
  expect(statuses.length).toBeGreaterThan(0)
  // Each entry has the three fields doctor renders
  for (const s of statuses) {
    expect(s.slot).toBeTruthy()
    expect(s.mode).toBeTruthy()
    expect(s.implementation).toBeTruthy()
  }
})

test('DOC-02: slots with inmemory fallback report implementation name containing "InMemory"', async ({ request }) => {
  const res = await request.get(`${GATEWAY}/health/adapters`)
  expect(res.status()).toBe(200)
  const statuses: { slot: string; mode: string; implementation: string; reason?: string }[] = await res.json()
  const inmemorySlots = statuses.filter(s => s.mode === 'inmemory')
  for (const s of inmemorySlots) {
    // All in-process fallbacks are InMemory* classes
    expect(s.implementation).toMatch(/InMemory|ConsoleLogger/)
    // Reason must be 'not-configured' — only way to end up in inmemory mode
    expect(s.reason).toBe('not-configured')
  }
})

test('DOC-03: slots with noop fallback report implementation name containing "NoOp"', async ({ request }) => {
  const res = await request.get(`${GATEWAY}/health/adapters`)
  expect(res.status()).toBe(200)
  const statuses: { slot: string; mode: string; implementation: string; reason?: string }[] = await res.json()
  const noopSlots = statuses.filter(s => s.mode === 'noop')
  for (const s of noopSlots) {
    expect(s.implementation).toMatch(/NoOp/)
    expect(s.reason).toBe('not-configured')
  }
})

test('DOC-04: real adapters have no reason field', async ({ request }) => {
  const res = await request.get(`${GATEWAY}/health/adapters`)
  expect(res.status()).toBe(200)
  const statuses: { slot: string; mode: string; reason?: string }[] = await res.json()
  const realSlots = statuses.filter(s => s.mode === 'real')
  for (const s of realSlots) {
    // Real adapters are configured — no degradation reason
    expect(s.reason).toBeUndefined()
  }
})

test('DOC-05: recordedAt timestamps are valid ISO 8601 strings', async ({ request }) => {
  const res = await request.get(`${GATEWAY}/health/adapters`)
  expect(res.status()).toBe(200)
  const statuses: { slot: string; recordedAt: string }[] = await res.json()
  for (const s of statuses) {
    const d = new Date(s.recordedAt)
    expect(isNaN(d.getTime()),
      `slot "${s.slot}" has invalid recordedAt: "${s.recordedAt}"`).toBe(false)
  }
})

test('DOC-06: no duplicate slot entries in the registry', async ({ request }) => {
  const res = await request.get(`${GATEWAY}/health/adapters`)
  expect(res.status()).toBe(200)
  const statuses: { slot: string }[] = await res.json()
  const slots = statuses.map(s => s.slot)
  const unique = new Set(slots)
  expect(unique.size).toBe(slots.length)
})
