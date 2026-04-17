import { test, expect } from '@playwright/test'
import { REST, WORKFLOW, STATE } from '../../fixtures/urls.js'

// /ready is deeper than /health — verifies internal components are wired up

// R-01: test rest-api /ready directly (gateway /ready requires auth — intentional)
test('R-01: rest-api /ready — registry loaded and plugins mounted', async ({ request }) => {
  const res = await request.get(`${REST}/ready`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  // REST API wraps responses: { ok: true, data: { ready, status, ... } }
  const data = body.data ?? body
  expect(data.ready).toBe(true)
  expect(data.status).toMatch(/ready|ok/)
})

test('R-02: workflow /ready — engine + catalog + scheduler ready', async ({ request }) => {
  const res = await request.get(`${WORKFLOW}/ready`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.status).toMatch(/ready|ok/)
  expect(body.components?.workflowEngine?.ready).toBe(true)
  expect(body.components?.workflowCatalog?.ready).toBe(true)
  expect(body.components?.cronScheduler?.ready).toBe(true)
})

test('R-03: state-daemon /ready — broker ready', async ({ request }) => {
  const res = await request.get(`${STATE}/ready`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.status).toMatch(/ready|ok/)
})

test('R-04: rest-api /ready — all plugin routes registered', async () => { test.skip(true, 'not yet implemented') })
test('R-05: marketplace /ready — registry loaded', async () => { test.skip(true, 'not yet implemented') })
