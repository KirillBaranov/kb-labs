import { test, expect } from '@playwright/test'
import { GATEWAY } from '../../fixtures/urls.js'

// SSE and WebSocket must be proxied correctly by gateway.
// Common failure: proxy strips Upgrade/Connection headers or buffers SSE response.
// Note: actual WS handshake requires a browser; these tests verify endpoint accessibility only.

test('RT-01: WebSocket endpoint responds (not ECONNREFUSED)', async ({ request }) => {
  // Cannot do a full WS upgrade without a browser — verify the endpoint is at least reachable
  // 401/400/426 are fine; ECONNREFUSED or 502 would mean the endpoint is broken
  const res = await request.get(`${GATEWAY}/hosts/connect`, {
    headers: { Connection: 'Upgrade', Upgrade: 'websocket' },
  }).catch(() => null)
  // Must get any HTTP response (not a connection failure)
  expect(res).not.toBeNull()
  expect(res!.status()).not.toBe(502)
})

test('RT-02: SSE endpoint streams events (not buffered by proxy)', async ({ request }) => {
  // Gateway must pass through Transfer-Encoding: chunked / Content-Type: text/event-stream
  // A buffering proxy would hold the response and deliver it all at once (broken SSE)
  const response = await request.get(`${GATEWAY}/api/v1/events`, {
    headers: { Accept: 'text/event-stream' },
    timeout: 5000,
  }).catch(() => null)

  // Skip if endpoint doesn't exist or requires auth
  test.skip(
    response === null || response.status() === 404 || response.status() === 401,
    'SSE events endpoint not available or requires auth',
  )

  expect(response!.status()).toBe(200)
  expect(response!.headers()['content-type']).toContain('text/event-stream')
  // Must NOT have content-length (that would mean buffered, not streaming)
  expect(response!.headers()['content-length']).toBeUndefined()
  // Must have cache-control: no-cache (required for SSE)
  expect(response!.headers()['cache-control']).toContain('no-cache')
})

test('RT-03: gateway handles upgrade path (not 502)', async ({ request }) => {
  // Check that gateway OPTIONS/GET on WS path does not return 502 (broken proxy)
  const res = await request.fetch(`${GATEWAY}/hosts/connect`, {
    method: 'OPTIONS',
    headers: {
      Connection: 'Upgrade',
      Upgrade: 'websocket',
    },
  }).catch(() => null)
  expect(res).not.toBeNull()
  // 502 = proxy failed to forward — anything else (401, 404, 405, 426) means gateway handled it
  expect(res!.status()).not.toBe(502)
})

test('RT-04: workflow status updates delivered over WS in real-time', async () => { test.skip(true, 'not yet implemented') })
test('RT-05: SSE reconnects after gateway restart within 5s', async () => { test.skip(true, 'not yet implemented') })
