import { test, expect } from '@playwright/test'
import { GATEWAY, REST, WORKFLOW, MARKETPLACE, STATE } from '../../fixtures/urls.js'

// /ready is deeper than /health — verifies internal components are wired up

test('R-01: gateway /ready — all upstreams healthy', async ({ request }) => {
  const res = await request.get(`${GATEWAY}/ready`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.status).toMatch(/ready|ok/)
  expect(body.components?.gateway?.ready).toBe(true)
})

test('R-02: workflow /ready — engine + catalog + scheduler ready', async ({ request }) => {
  const res = await request.get(`${WORKFLOW}/ready`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.status).toMatch(/ready|ok/)
  expect(body.components?.engine?.ready).toBe(true)
  expect(body.components?.catalog?.ready).toBe(true)
  expect(body.components?.scheduler?.ready).toBe(true)
})

test('R-03: state-daemon /ready — broker ready', async ({ request }) => {
  const res = await request.get(`${STATE}/ready`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.status).toMatch(/ready|ok/)
})

test.todo('R-04: rest-api /ready — all plugin routes registered')
test.todo('R-05: marketplace /ready — registry loaded')
