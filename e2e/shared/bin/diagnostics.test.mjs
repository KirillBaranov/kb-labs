import test from 'node:test'
import assert from 'node:assert/strict'
import { redact } from './diagnostics.mjs'

test('redacts common credentials from captured output', () => {
  const value = redact('Authorization: Bearer abc123 password=secret https://user:pass@example.test')
  assert.equal(value.includes('abc123'), false)
  assert.equal(value.includes('secret'), false)
  assert.equal(value.includes('user:pass'), false)
  assert.match(value, /\[REDACTED\]/)
})
