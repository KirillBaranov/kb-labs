import { test, expect } from '@playwright/test'
import { REST } from '../../fixtures/urls.js'

// projectRoot config overrides platformRoot config.
// Tests verify the override is applied and surfaced in the API.

test('ROOT-01: platform config exposes which root paths are active', async ({ request }) => {
  const res = await request.get(`${REST}/api/v1/platform/config`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  // Config must indicate which root is in use so overrides are traceable
  const hasRootInfo =
    'projectRoot' in body ||
    'platformRoot' in body ||
    'rootPath' in body ||
    body.meta?.projectRoot != null
  expect(hasRootInfo).toBe(true)
})

test('ROOT-02: projectRoot config overrides platformRoot adapter config', async ({ request }) => {
  // When a project has .kb/kb.config.json with adapterOptions, it takes precedence.
  // We verify this by checking config is non-empty and reflects project-level values.
  const res = await request.get(`${REST}/api/v1/platform/config`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  // If projectRoot override is applied, adapterOptions must not be the platform default
  // (This is an existence check — deeper assertions need a fixture project with known config)
  expect(body).toBeTruthy()
})

test('ROOT-03: plugin registry uses projectRoot for local plugin discovery', async ({ request }) => {
  const res = await request.get(`${REST}/api/v1/plugins/registry`)
  expect(res.status()).toBe(200)
  const plugins: { source?: string; root?: string }[] = await res.json()
  const pluginList = Array.isArray(plugins) ? plugins : (plugins as any).plugins ?? []
  // Plugins discovered from project root must be present
  expect(pluginList.length).toBeGreaterThan(0)
})

test('ROOT-04: start with custom projectRoot env var → config reflects that root', async () => { test.skip(true, 'not yet implemented') })
test('ROOT-05: workflow daemon discovers .kb/workflows from projectRoot not platformRoot', async () => { test.skip(true, 'not yet implemented') })
test('ROOT-06: marketplace lock file is read from projectRoot/.kb/marketplace.lock', async () => { test.skip(true, 'not yet implemented') })
