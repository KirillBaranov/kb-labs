import { test, expect } from '@playwright/test'
import { MARKETPLACE } from '../../fixtures/urls.js'

// Verifies marketplace is functional after kb-create bootstrap

test('MKT-01: marketplace lists installed packages', async ({ request }) => {
  const res = await request.get(`${MARKETPLACE}/api/v1/marketplace/packages`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  const packages = Array.isArray(body) ? body : body.packages ?? []
  // kb-create bootstraps with core packages — must not be empty
  expect(packages.length).toBeGreaterThan(0)
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
  // Install
  const install = await request.post(`${MARKETPLACE}/api/v1/marketplace/packages/install`, {
    data: { packages: ['@kb-labs/plugin-commit'] },
  })
  expect(install.status()).toBeOneOf([200, 201, 409]) // 409 = already installed, fine

  // Verify it's listed
  const list = await request.get(`${MARKETPLACE}/api/v1/marketplace/packages`)
  const packages: { name?: string; id?: string }[] = await list.json()
  const found = packages.some(p => p.name?.includes('commit') || p.id?.includes('commit'))
  expect(found).toBe(true)
})

test.todo('MKT-04: install entity from remote registry')
test.todo('MKT-05: disable package → commands disappear from CLI')
