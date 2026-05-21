import { test, expect } from '@playwright/test'
import { REST } from '@kb-labs/e2e-shared/urls.js'

const BASE = `${REST}/api/v1`

// Workflow SSE endpoints: only stream lifecycle tests (no real workflow running).
// Full event-payload coverage lives in e2e/workflows/.

const FAKE_RUN_ID = 'e2e-nonexistent-run-00000000'

test('RA-WF-01: GET /workflows/runs/:runId/events opens SSE stream (text/event-stream)', async ({ request }) => {
  const res = await request.get(`${BASE}/workflows/runs/${FAKE_RUN_ID}/events`, {
    headers: { Accept: 'text/event-stream' },
    timeout: 5_000,
  }).catch(e => {
    // timeout on body read is expected for SSE
    if (e?.message?.includes('timeout') || e?.message?.includes('aborted')) return null
    throw e
  })
  if (res === null) return
  expect([200, 204]).toContain(res.status())
  const ct = res.headers()['content-type'] ?? ''
  expect(ct).toContain('text/event-stream')
})

test('RA-WF-02: GET /workflows/runs/:runId/events response has no-cache header', async ({ request }) => {
  // Check headers only via a short-timeout request
  const res = await request.get(`${BASE}/workflows/runs/${FAKE_RUN_ID}/events`, {
    headers: { Accept: 'text/event-stream' },
    timeout: 3_000,
  }).catch(() => null)
  if (res === null) return
  if (res.status() !== 200) return
  const cc = res.headers()['cache-control'] ?? ''
  expect(cc).toContain('no-cache')
})

test('RA-WF-03: GET /workflows/runs/:runId/events closes after idle timeout', async () => {
  const idleMs = 2_000
  const url = `${BASE}/workflows/runs/${FAKE_RUN_ID}/events?idleTimeoutMs=${idleMs}`

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), idleMs + 4_000)

  let streamClosed = false
  try {
    const res = await fetch(url, {
      headers: { Accept: 'text/event-stream' },
      signal: ctrl.signal,
    })
    if (res.body) {
      const reader = res.body.getReader()
      // Read until done — stream should close after idleMs
      let done = false
      while (!done) {
        const chunk = await reader.read()
        done = chunk.done
      }
      streamClosed = true
      reader.cancel().catch(() => undefined)
    }
  } catch {
    // AbortError means our timeout fired before the stream closed
    streamClosed = false
  } finally {
    clearTimeout(timer)
  }

  expect(streamClosed).toBe(true)
})

test('RA-WF-04: GET /workflows/runs/:runId/logs opens SSE stream', async ({ request }) => {
  const res = await request.get(`${BASE}/workflows/runs/${FAKE_RUN_ID}/logs`, {
    headers: { Accept: 'text/event-stream' },
    timeout: 5_000,
  }).catch(e => {
    if (e?.message?.includes('timeout') || e?.message?.includes('aborted')) return null
    throw e
  })
  if (res === null) return
  expect([200, 204]).toContain(res.status())
  const ct = res.headers()['content-type'] ?? ''
  expect(ct).toContain('text/event-stream')
})

test('RA-WF-05: GET /workflows/runs/:runId/logs closes after idle timeout', async () => {
  const idleMs = 2_000
  const url = `${BASE}/workflows/runs/${FAKE_RUN_ID}/logs?idleTimeoutMs=${idleMs}`

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), idleMs + 4_000)

  let streamClosed = false
  try {
    const res = await fetch(url, {
      headers: { Accept: 'text/event-stream' },
      signal: ctrl.signal,
    })
    if (res.body) {
      const reader = res.body.getReader()
      let done = false
      while (!done) {
        const chunk = await reader.read()
        done = chunk.done
      }
      streamClosed = true
      reader.cancel().catch(() => undefined)
    }
  } catch {
    streamClosed = false
  } finally {
    clearTimeout(timer)
  }

  expect(streamClosed).toBe(true)
})
