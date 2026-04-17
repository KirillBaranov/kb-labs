import { test, expect } from '@playwright/test'
import { GATEWAY, REST, MARKETPLACE, WORKFLOW, STATE } from '../../fixtures/urls.js'

const services = [
  { id: 'S-01', name: 'gateway',      url: GATEWAY,     path: '/health' },
  { id: 'S-02', name: 'rest-api',     url: REST,        path: '/health' },
  { id: 'S-03', name: 'marketplace',  url: MARKETPLACE, path: '/health' },
  { id: 'S-04', name: 'workflow',     url: WORKFLOW,    path: '/health' },
  { id: 'S-05', name: 'state-daemon', url: STATE,       path: '/health' },
]

for (const svc of services) {
  test(`${svc.id}: ${svc.name} is healthy`, async ({ request }) => {
    const res = await request.get(`${svc.url}${svc.path}`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.status).toMatch(/ok|healthy|ready/)
  })
}
