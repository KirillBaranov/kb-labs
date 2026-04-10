import { describe, it, expect } from 'vitest'
import { toBool, toInt } from '../env'

describe('toBool', () => {
  it('parses truthy values', () => {
    for (const v of ['1','true','yes','on',' TRUE ','Yes']) {
      expect(toBool(v)).toBe(true)
    }
  })

  it('parses falsy values', () => {
    for (const v of ['0','false','no','off',' False ']) {
      expect(toBool(v)).toBe(false)
    }
  })

  it('returns undefined for unknown or undefined', () => {
    expect(toBool('maybe')).toBeUndefined()
    expect(toBool(undefined)).toBeUndefined()
    expect(toBool('')).toBeUndefined()
  })
})

describe('toInt', () => {
  it('parses valid integers', () => {
    expect(toInt('0')).toBe(0)
    expect(toInt('42')).toBe(42)
    expect(toInt('  7  ')).toBe(7)
  })

  it('returns undefined for invalid numbers or undefined', () => {
    expect(toInt('abc')).toBeUndefined()
    expect(toInt('NaN')).toBeUndefined()
    expect(toInt(undefined)).toBeUndefined()
    expect(toInt('')).toBe(0) // Number('') === 0 → considered valid
  })
})


