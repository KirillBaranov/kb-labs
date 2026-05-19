import { test, expect } from '@playwright/test'
import { GATEWAY } from '@kb-labs/e2e-shared/urls.js'
import { getAccessToken } from '@kb-labs/e2e-shared/auth.js'

test('GW-TEL-01: POST /telemetry/v1/ingest without token returns 401', async ({ request }) => {
  const res = await request.post(`${GATEWAY}/telemetry/v1/ingest`, {
    data: { events: [] },
  })
  expect([401, 403]).toContain(res.status())
})

test('GW-TEL-02: POST /telemetry/v1/ingest with valid event and token returns 2xx', async ({ request }) => {
  const token = await getAccessToken(request)
  const res = await request.post(`${GATEWAY}/telemetry/v1/ingest`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      events: [
        {
          source: 'e2e-test',
          type: 'e2e.test',
          timestamp: new Date().toISOString(),
          payload: { env: 'e2e' },
        },
      ],
    },
  })
  expect(res.status()).toBeGreaterThanOrEqual(200)
  expect(res.status()).toBeLessThan(300)
})

test('GW-TEL-03: POST /telemetry/v1/ingest with invalid body returns 4xx', async ({ request }) => {
  const token = await getAccessToken(request)
  const res = await request.post(`${GATEWAY}/telemetry/v1/ingest`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: 'not-valid-json-object',
  })
  expect(res.status()).toBeGreaterThanOrEqual(400)
  expect(res.status()).toBeLessThan(500)
})
