import { test, expect } from '@playwright/test'
import { REST } from '../../fixtures/urls.js'

// Verifies platform config is loaded and adapters are configured

test('CFG-01: platform config endpoint responds', async ({ request }) => {
  const res = await request.get(`${REST}/api/v1/platform/config`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  // Config must exist and have an execution mode
  expect(body).toBeTruthy()
  expect(body.executionMode ?? body.execution?.mode).toBeTruthy()
})

test('CFG-02: platform config has adapters section (no empty config)', async ({ request }) => {
  const res = await request.get(`${REST}/api/v1/platform/config`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  // At minimum adapters key must exist — secrets are redacted, that's fine
  expect('adapters' in body || 'adapterOptions' in body).toBe(true)
})

test('CFG-03: LLM adapter is configured (not placeholder)', async () => { test.skip(true, 'not yet implemented') })
test('CFG-04: storage adapter is configured', async () => { test.skip(true, 'not yet implemented') })
