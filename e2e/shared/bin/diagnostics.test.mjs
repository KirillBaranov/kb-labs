import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { redact, resolveMetricsUrl } from './diagnostics.mjs'

test('redacts common credentials from captured output', () => {
  const value = redact('Authorization: Bearer abc123 password=secret https://user:pass@example.test')
  assert.equal(value.includes('abc123'), false)
  assert.equal(value.includes('secret'), false)
  assert.equal(value.includes('user:pass'), false)
  assert.match(value, /\[REDACTED\]/)
})

test('uses the service observability descriptor for non-standard metrics paths', async () => {
  const server = createServer((request, response) => {
    if (request.url === '/observability/describe') {
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ metricsEndpoint: '/api/v1/metrics' }))
      return
    }
    response.end('ok')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    const url = await resolveMetricsUrl(`http://127.0.0.1:${address.port}`, {})
    assert.equal(url, `http://127.0.0.1:${address.port}/api/v1/metrics`)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
})
