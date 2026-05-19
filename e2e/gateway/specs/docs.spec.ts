import { test, expect } from '@playwright/test'
import { GATEWAY } from '@kb-labs/e2e-shared/urls.js'

test('GW-DOC-01: GET /openapi-merged.json returns valid OpenAPI document', async ({ request }) => {
  const res = await request.get(`${GATEWAY}/openapi-merged.json`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  // Must be an OpenAPI 3.x document
  expect(body.openapi ?? body.swagger).toBeTruthy()
})

test('GW-DOC-02: GET /docs-all returns HTML Swagger UI', async ({ request }) => {
  const res = await request.get(`${GATEWAY}/docs-all`)
  expect(res.status()).toBe(200)
  const text = await res.text()
  expect(text.toLowerCase()).toContain('swagger')
})
