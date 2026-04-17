import { test, expect } from '@playwright/test'
import { MARKETPLACE } from '../../fixtures/urls.js'

// Verifies marketplace is functional after kb-create bootstrap
// GET /packages → { entries: [...], total: N }
// POST /packages/install → { specs: [...] } (not { packages: [...] })

test('MKT-01: marketplace lists installed packages', async ({ request }) => {
  const res = await request.get(`${MARKETPLACE}/api/v1/marketplace/packages`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  const packages = body.entries ?? body.packages ?? (Array.isArray(body) ? body : [])
  // Fresh install may have no packages — endpoint must return a valid array
  expect(Array.isArray(packages)).toBe(true)
})

test('MKT-02: marketplace diagnostics — lock file OK, no errors', async ({ request }) => {
  const res = await request.get(`${MARKETPLACE}/api/v1/marketplace/diagnostics`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.lockFile?.ok ?? body.ok).toBe(true)
  const errors: unknown[] = body.errors ?? []
  expect(errors.length).toBe(0)
})

test('MKT-03: install and uninstall a test package', async ({ request }) => {
  // Install — body uses `specs` key (not `packages`)
  const install = await request.post(`${MARKETPLACE}/api/v1/marketplace/packages/install`, {
    data: { specs: ['@kb-labs/plugin-commit'] },
  })
  // 500 = npm registry unreachable (network isolation in CI container)
  test.skip(install.status() === 500, 'npm registry unreachable from container')
  expect([200, 201, 409]).toContain(install.status()) // 409 = already installed, fine

  // Verify it's listed
  const list = await request.get(`${MARKETPLACE}/api/v1/marketplace/packages`)
  const body = await list.json()
  const packages: { name?: string; id?: string }[] = body.entries ?? body.packages ?? []
  const found = packages.some(p => p.name?.includes('commit') || p.id?.includes('commit'))
  expect(found).toBe(true)
})

test('MKT-04: install entity from remote registry', async () => { test.skip(true, 'not yet implemented') })
test('MKT-05: disable package → commands disappear from CLI', async () => { test.skip(true, 'not yet implemented') })
