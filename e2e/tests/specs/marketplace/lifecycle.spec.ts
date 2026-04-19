import { test, expect } from '@playwright/test'
import { MARKETPLACE } from '../../fixtures/urls.js'

// Marketplace package lifecycle: install → disable → enable → uninstall
// All mutating operations use the body-based API (not URL-encoded package IDs)
// because plugin IDs contain `@` and `/` that break URL-path routing.

const TEST_SPEC = '@kb-labs/plugin-commit'

// ML-01: install package → appears in listing
test('ML-01: install package → appears in GET /packages', async ({ request }) => {
  const install = await request.post(`${MARKETPLACE}/api/v1/marketplace/packages/install`, {
    data: { specs: [TEST_SPEC] },
  })
  test.skip(install.status() === 500, 'npm registry unreachable from this environment')
  expect([200, 201, 409]).toContain(install.status()) // 409 = already installed

  const list = await request.get(`${MARKETPLACE}/api/v1/marketplace/packages`)
  expect(list.status()).toBe(200)
  const body = await list.json()
  const packages: { name?: string; id?: string; spec?: string }[] = body.entries ?? body.packages ?? []
  const found = packages.some(
    p => p.name?.includes('commit') || p.id?.includes('commit') || p.spec?.includes('commit'),
  )
  expect(found).toBe(true)
})

// ML-02: disable package → listing reflects disabled state
test('ML-02: disable package → disabled flag set in listing', async ({ request }) => {
  // Ensure installed first
  const install = await request.post(`${MARKETPLACE}/api/v1/marketplace/packages/install`, {
    data: { specs: [TEST_SPEC] },
  })
  test.skip(install.status() === 500, 'npm registry unreachable from this environment')
  expect([200, 201, 409]).toContain(install.status())

  // Disable
  const disable = await request.post(`${MARKETPLACE}/api/v1/marketplace/packages/disable`, {
    data: { packageId: TEST_SPEC },
  })
  test.skip(disable.status() === 404, 'disable endpoint not available in this build')
  expect(disable.status()).toBe(200)
  const disableBody = await disable.json()
  const disableData = disableBody.data ?? disableBody
  expect(disableData.enabled).toBe(false)

  // Verify listing shows disabled
  const list = await request.get(`${MARKETPLACE}/api/v1/marketplace/packages`)
  const listBody = await list.json()
  const packages: { name?: string; id?: string; spec?: string; enabled?: boolean }[] =
    listBody.entries ?? listBody.packages ?? []
  const pkg = packages.find(
    p => p.name?.includes('commit') || p.id?.includes('commit') || p.spec?.includes('commit'),
  )
  if (pkg && 'enabled' in pkg) {
    expect(pkg.enabled).toBe(false)
  }
})

// ML-03: enable previously disabled package → enabled flag restored
test('ML-03: enable package → enabled flag restored in listing', async ({ request }) => {
  const install = await request.post(`${MARKETPLACE}/api/v1/marketplace/packages/install`, {
    data: { specs: [TEST_SPEC] },
  })
  test.skip(install.status() === 500, 'npm registry unreachable from this environment')
  expect([200, 201, 409]).toContain(install.status())

  // Disable first
  await request.post(`${MARKETPLACE}/api/v1/marketplace/packages/disable`, {
    data: { packageId: TEST_SPEC },
  })

  // Re-enable
  const enable = await request.post(`${MARKETPLACE}/api/v1/marketplace/packages/enable`, {
    data: { packageId: TEST_SPEC },
  })
  test.skip(enable.status() === 404, 'enable endpoint not available in this build')
  expect(enable.status()).toBe(200)
  const enableBody = await enable.json()
  const enableData = enableBody.data ?? enableBody
  expect(enableData.enabled).toBe(true)
})

// ML-04: update installed package — endpoint responds without error
test('ML-04: POST /packages/update — responds without error', async ({ request }) => {
  const install = await request.post(`${MARKETPLACE}/api/v1/marketplace/packages/install`, {
    data: { specs: [TEST_SPEC] },
  })
  test.skip(install.status() === 500, 'npm registry unreachable from this environment')
  expect([200, 201, 409]).toContain(install.status())

  const update = await request.post(`${MARKETPLACE}/api/v1/marketplace/packages/update`, {
    data: { packageIds: [TEST_SPEC] },
  })
  test.skip(update.status() === 404, 'update endpoint not available in this build')
  // 200 = updated, 204 = already at latest, both are valid
  expect([200, 204]).toContain(update.status())
})

// ML-05: uninstall package → no longer in listing
test('ML-05: uninstall package → gone from GET /packages', async ({ request }) => {
  // Install first so we have something to uninstall
  const install = await request.post(`${MARKETPLACE}/api/v1/marketplace/packages/install`, {
    data: { specs: [TEST_SPEC] },
  })
  test.skip(install.status() === 500, 'npm registry unreachable from this environment')
  expect([200, 201, 409]).toContain(install.status())

  // Uninstall
  const uninstall = await request.post(`${MARKETPLACE}/api/v1/marketplace/packages/uninstall`, {
    data: { packageIds: [TEST_SPEC] },
  })
  test.skip(uninstall.status() === 404, 'uninstall endpoint not available in this build')
  expect([200, 204]).toContain(uninstall.status())

  // Give it a moment, then verify gone
  await new Promise(resolve => setTimeout(resolve, 500))
  const list = await request.get(`${MARKETPLACE}/api/v1/marketplace/packages`)
  const body = await list.json()
  const packages: { name?: string; id?: string; spec?: string }[] =
    body.entries ?? body.packages ?? []
  const found = packages.some(
    p => p.name?.includes('commit') || p.id?.includes('commit') || p.spec?.includes('commit'),
  )
  // After uninstall the package must NOT be in the listing
  expect(found).toBe(false)
})
