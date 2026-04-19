import { test, expect } from '@playwright/test'
import { REST } from '../../fixtures/urls.js'

// SC-01: scaffold lists available templates
test('SC-01: scaffold lists available templates', async ({ request }) => {
  const res = await request.get(`${REST}/api/v1/scaffold/templates`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  const templates: { id?: string; name?: string }[] =
    body.data?.templates ?? body.templates ?? (Array.isArray(body) ? body : [])
  expect(Array.isArray(templates)).toBe(true)
  expect(templates.length).toBeGreaterThanOrEqual(1)
  // At least one template must be plugin-related
  const hasPlugin = templates.some(
    t => t.id?.includes('plugin') || t.name?.includes('plugin'),
  )
  expect(hasPlugin).toBe(true)
})

// SC-02: scaffold plugin template has required fields
test('SC-02: scaffold plugin template has required structure', async ({ request }) => {
  const res = await request.get(`${REST}/api/v1/scaffold/templates`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  const templates: { id?: string; name?: string; description?: string; type?: string }[] =
    body.data?.templates ?? body.templates ?? (Array.isArray(body) ? body : [])

  const pluginTemplate = templates.find(
    t => t.id?.includes('plugin') || t.name?.includes('plugin'),
  )
  test.skip(!pluginTemplate, 'no plugin template found in scaffold templates list')

  // Template must have at least an identifier and a description or type
  expect(pluginTemplate!.id ?? pluginTemplate!.name).toBeTruthy()
  expect(pluginTemplate!.description ?? pluginTemplate!.type).toBeTruthy()
})

// SC-03: scaffold run creates plugin files (if scaffold/run endpoint exists)
test('SC-03: scaffold run creates plugin structure', async ({ request }) => {
  const res = await request.post(`${REST}/api/v1/scaffold/run`, {
    data: {
      template: 'plugin',
      name: 'e2e-test-plugin',
      targetDir: '/tmp/e2e-scaffold-test',
    },
  })

  // Skip if the endpoint is not exposed yet
  test.skip(
    res.status() === 404 || res.status() === 501,
    'scaffold/run endpoint not exposed by REST API',
  )

  expect([200, 201]).toContain(res.status())
  const body = await res.json()
  const data = body.data ?? body
  // Response must contain either a files array or an outputDir
  const hasFiles = Array.isArray(data.files) && data.files.length > 0
  const hasOutputDir = typeof data.outputDir === 'string' && data.outputDir.length > 0
  expect(hasFiles || hasOutputDir).toBe(true)
})
