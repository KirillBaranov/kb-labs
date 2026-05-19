import { test, expect } from '@playwright/test'
import { REST } from '@kb-labs/e2e-shared/urls.js'

const BASE = `${REST}/v1/plugins/quality`

test('QL-01: GET /health returns score and issues', async ({ request }) => {
  const res = await request.get(`${BASE}/health`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  // calculateHealth returns { score, grade, issues, ... }
  expect(typeof body.score).toBe('number')
  expect(body.score).toBeGreaterThanOrEqual(0)
  expect(body.score).toBeLessThanOrEqual(100)
  expect(Array.isArray(body.issues)).toBe(true)
})

test('QL-02: GET /stats returns package count and LOC', async ({ request }) => {
  const res = await request.get(`${BASE}/stats`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  // StatsResponse: { packages: number, loc: number, size: string }
  expect(typeof body.packages).toBe('number')
  expect(body.packages).toBeGreaterThan(0)
  expect(typeof body.loc).toBe('number')
  expect(typeof body.size).toBe('string')
})

test('QL-03: GET /dependencies returns duplicate/unused/missing arrays with totalIssues', async ({ request }) => {
  const res = await request.get(`${BASE}/dependencies`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  // DependenciesResponse: { duplicates, unused, missing, totalIssues }
  expect(Array.isArray(body.duplicates)).toBe(true)
  expect(Array.isArray(body.unused)).toBe(true)
  expect(Array.isArray(body.missing)).toBe(true)
  expect(typeof body.totalIssues).toBe('number')
  expect(body.totalIssues).toBe(
    body.duplicates.length + body.unused.length + body.missing.length
  )
})

test('QL-04: GET /build-order returns sorted list and layer info', async ({ request }) => {
  const res = await request.get(`${BASE}/build-order`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  // BuildOrderResponse: { layers, sorted, circular, packageCount, layerCount, hasCircular }
  expect(Array.isArray(body.sorted)).toBe(true)
  expect(body.sorted.length).toBeGreaterThan(0)
  expect(typeof body.packageCount).toBe('number')
  expect(typeof body.hasCircular).toBe('boolean')
  // At least one known package should be in the build order
  const hasKbPackage = body.sorted.some((pkg: string) => pkg.startsWith('@kb-labs/'))
  expect(hasKbPackage).toBe(true)
})

test('QL-05: GET /cycles returns cycles array with count and hasCircular', async ({ request }) => {
  const res = await request.get(`${BASE}/cycles`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  // CyclesResponse: { cycles, count, hasCircular, affected }
  expect(Array.isArray(body.cycles)).toBe(true)
  expect(typeof body.count).toBe('number')
  expect(typeof body.hasCircular).toBe('boolean')
  expect(Array.isArray(body.affected)).toBe(true)
  expect(body.count).toBe(body.cycles.length)
})

test('QL-06: GET /layers returns violations with totalViolations', async ({ request }) => {
  const res = await request.get(`${BASE}/layers`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  // LayeringResponse: { violations, totalViolations, affectedPackages, layerMap }
  expect(Array.isArray(body.violations)).toBe(true)
  expect(typeof body.totalViolations).toBe('number')
  expect(Array.isArray(body.affectedPackages)).toBe(true)
  expect(typeof body.layerMap).toBe('object')
})

test('QL-07: GET /coupling returns packages with instability metrics', async ({ request }) => {
  const res = await request.get(`${BASE}/coupling`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  // CouplingResponse: { packages, avgInstability, mostUnstable, mostCoupled }
  expect(Array.isArray(body.packages)).toBe(true)
  expect(body.packages.length).toBeGreaterThan(0)
  expect(typeof body.avgInstability).toBe('number')
  // Each package has instability in [0, 1]
  for (const pkg of body.packages.slice(0, 5)) {
    expect(typeof pkg.name).toBe('string')
    expect(pkg.instability).toBeGreaterThanOrEqual(0)
    expect(pkg.instability).toBeLessThanOrEqual(1)
  }
})
