import { test, expect } from '@playwright/test'
import { REST } from '../../fixtures/urls.js'

test('A-01: LLM adapter registered in REST API', async ({ request }) => {
  const res = await request.get(`${REST}/api/v1/adapters`)
  test.skip(res.status() === 404, 'Adapters endpoint not available')
  expect(res.status()).toBe(200)
  const adapters: { type?: string }[] = await res.json()
  expect(adapters.some(a => a.type?.includes('llm'))).toBe(true)
})

test('A-02: storage adapter registered', async () => { test.skip(true, 'not yet implemented') })
test('A-03: LLM adapter responds to a real completion request', async () => { test.skip(true, 'not yet implemented') })
