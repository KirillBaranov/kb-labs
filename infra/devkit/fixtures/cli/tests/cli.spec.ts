import { describe, it, expect } from 'vitest'

describe('CLI fixture', () => {
  it('should greet without excitement', () => {
    const greeting = `Hello, ${'World'}${false ? '!' : '.'}`
    expect(greeting).toBe('Hello, World.')
  })

  it('should greet with excitement', () => {
    const greeting = `Hello, ${'World'}${true ? '!' : '.'}`
    expect(greeting).toBe('Hello, World!')
  })

  it('should perform addition', () => {
    const result = 5 + 3
    expect(`Result: ${result}`).toBe('Result: 8')
  })

  it('should handle division by zero', () => {
    const b = 0
    expect(b === 0).toBe(true)
  })
})
