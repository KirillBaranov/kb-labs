import { describe, it, expect } from 'vitest'
import path from 'node:path'
import os from 'node:os'

import { toAbsolute } from '../fs'

describe('toAbsolute', () => {
  it('returns baseDir when maybeRelative is falsy', () => {
    const base = os.tmpdir()
    expect(toAbsolute(base, undefined)).toBe(base)
    expect(toAbsolute(base, '')).toBe(path.join(base, ''))
  })

  it('returns absolute path as-is', () => {
    const abs = path.join(os.tmpdir(), 'x', 'y')
    expect(path.isAbsolute(abs)).toBe(true)
    expect(toAbsolute('/root', abs)).toBe(abs)
  })

  it('joins relative path to base', () => {
    const base = path.join(os.tmpdir(), 'base')
    const res = toAbsolute(base, 'child/file.txt')
    expect(res).toBe(path.join(base, 'child/file.txt'))
  })
})


