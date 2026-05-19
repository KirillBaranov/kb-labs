import { test, expect } from '@playwright/test'
import { REST } from '@kb-labs/e2e-shared/urls.js'

const BASE = `${REST}/v1/plugins/quality`

test('QL-01: GET /v1/plugins/quality/health returns 200', async ({ request }) => {
  const res = await request.get(`${BASE}/health`)
  expect(res.status()).toBe(200)
})

test('QL-02: GET /v1/plugins/quality/stats returns stats object', async ({ request }) => {
  const res = await request.get(`${BASE}/stats`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  const data = body.data ?? body
  expect(typeof data).toBe('object')
  expect(data).not.toBeNull()
})

test('QL-03: GET /v1/plugins/quality/dependencies returns dependency data', async ({ request }) => {
  const res = await request.get(`${BASE}/dependencies`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body).toBeTruthy()
})

test('QL-04: GET /v1/plugins/quality/build-order returns ordered list', async ({ request }) => {
  const res = await request.get(`${BASE}/build-order`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  const list = body.data ?? body.buildOrder ?? body
  expect(Array.isArray(list) || typeof list === 'object').toBe(true)
})

test('QL-05: GET /v1/plugins/quality/cycles returns cycles report', async ({ request }) => {
  const res = await request.get(`${BASE}/cycles`)
  expect(res.status()).toBe(200)
})

test('QL-06: GET /v1/plugins/quality/layers returns layering report', async ({ request }) => {
  const res = await request.get(`${BASE}/layers`)
  expect(res.status()).toBe(200)
})

test('QL-07: GET /v1/plugins/quality/coupling returns coupling metrics', async ({ request }) => {
  const res = await request.get(`${BASE}/coupling`)
  expect(res.status()).toBe(200)
})
