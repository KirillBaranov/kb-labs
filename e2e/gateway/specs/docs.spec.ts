import { test, expect } from '@playwright/test'
import { GATEWAY } from '@kb-labs/e2e-shared/urls.js'
import { getAccessToken } from '@kb-labs/e2e-shared/auth.js'

test('GW-DOC-01: GET /openapi-merged.json returns valid OpenAPI document', async ({ request }) => {
  const token = await getAccessToken(request)
  const res = await request.get(`${GATEWAY}/openapi-merged.json`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.openapi ?? body.swagger).toBeTruthy()
})

test('GW-DOC-02: GET /docs-all returns HTML Swagger UI', async ({ request }) => {
  const token = await getAccessToken(request)
  const res = await request.get(`${GATEWAY}/docs-all`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.status()).toBe(200)
  const text = await res.text()
  expect(text.toLowerCase()).toContain('swagger')
})
