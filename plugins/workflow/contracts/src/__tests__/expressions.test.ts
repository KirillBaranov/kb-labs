import { describe, it, expect } from 'vitest'
import { evaluateExpression, interpolateString, resolveExpression, interpolateObject, resolveValue } from '../expressions'
import type { ExpressionContext } from '../types'

describe('Expression Evaluation', () => {
  const baseContext: ExpressionContext = {
    env: { NODE_ENV: 'production', VERSION: '1.0.0' },
    trigger: {
      type: 'push',
      actor: 'user',
      payload: { ref: 'refs/heads/main' },
    },
    steps: {},
  }

  it('should evaluate boolean literals', () => {
    expect(evaluateExpression('true', baseContext)).toBe(true)
    expect(evaluateExpression('false', baseContext)).toBe(false)
  })

  it('should evaluate equality', () => {
    expect(evaluateExpression('env.NODE_ENV == "production"', baseContext)).toBe(true)
    expect(evaluateExpression('env.NODE_ENV == "development"', baseContext)).toBe(false)
  })

  it('should evaluate inequality', () => {
    expect(evaluateExpression('env.NODE_ENV != "development"', baseContext)).toBe(true)
    expect(evaluateExpression('env.NODE_ENV != "production"', baseContext)).toBe(false)
  })

  it('should evaluate contains function', () => {
    expect(evaluateExpression('contains(env.VERSION, "1.0")', baseContext)).toBe(true)
    expect(evaluateExpression('contains(env.VERSION, "2.0")', baseContext)).toBe(false)
  })

  it('should evaluate startsWith function', () => {
    expect(evaluateExpression('startsWith(trigger.payload.ref, "refs/heads/")', baseContext)).toBe(true)
    expect(evaluateExpression('startsWith(trigger.payload.ref, "refs/tags/")', baseContext)).toBe(false)
  })

  it('should evaluate endsWith function', () => {
    expect(evaluateExpression('endsWith(trigger.payload.ref, "/main")', baseContext)).toBe(true)
    expect(evaluateExpression('endsWith(trigger.payload.ref, "/develop")', baseContext)).toBe(false)
  })

  it('should handle parentheses', () => {
    expect(evaluateExpression('(true)', baseContext)).toBe(true)
    expect(evaluateExpression('(env.NODE_ENV == "production")', baseContext)).toBe(true)
  })

  it('should interpolate strings', () => {
    const result = interpolateString('Hello ${{ env.NODE_ENV }}', baseContext)
    expect(result).toBe('Hello production')
  })

  it('should interpolate multiple expressions', () => {
    const result = interpolateString('Version ${{ env.VERSION }} by ${{ trigger.actor }}', baseContext)
    expect(result).toBe('Version 1.0.0 by user')
  })

  it('should handle step outputs', () => {
    const contextWithSteps: ExpressionContext = {
      ...baseContext,
      steps: {
        test: {
          outputs: {
            exitCode: 0,
            result: 'success',
          },
        },
      },
    }

    // String comparison - both sides are coerced to string
    expect(evaluateExpression('steps.test.outputs.exitCode == 0', contextWithSteps)).toBe(true)
    expect(evaluateExpression('steps.test.outputs.result == success', contextWithSteps)).toBe(true)
  })

  it('should handle empty expressions', () => {
    expect(evaluateExpression('', baseContext)).toBe(false)
    expect(evaluateExpression('   ', baseContext)).toBe(false)
  })
})

describe('resolveValue', () => {
  const ctx: ExpressionContext = {
    env: { REGION: 'us-east-1', COUNT: '42' },
    trigger: {
      type: 'manual',
      actor: 'alice',
      payload: { branch: 'main', depth: 3 },
    },
    steps: {
      build: {
        outputs: { version: '2.1.0', passed: true, score: 99 },
      },
    },
    matrix: { os: 'ubuntu', node: 20 },
  }

  it('resolves env variables', () => {
    expect(resolveValue('env.REGION', ctx)).toBe('us-east-1')
    expect(resolveValue('env.MISSING', ctx)).toBe('')
  })

  it('resolves trigger.type and trigger.actor', () => {
    expect(resolveValue('trigger.type', ctx)).toBe('manual')
    expect(resolveValue('trigger.actor', ctx)).toBe('alice')
  })

  it('resolves trigger.payload fields', () => {
    expect(resolveValue('trigger.payload.branch', ctx)).toBe('main')
    expect(resolveValue('trigger.payload.depth', ctx)).toBe(3)
    expect(resolveValue('trigger.payload.missing', ctx)).toBe('')
  })

  it('resolves step outputs', () => {
    expect(resolveValue('steps.build.outputs.version', ctx)).toBe('2.1.0')
    expect(resolveValue('steps.build.outputs.passed', ctx)).toBe(true)
    expect(resolveValue('steps.build.outputs.score', ctx)).toBe(99)
  })

  it('returns empty string for unknown step', () => {
    expect(resolveValue('steps.missing.outputs.foo', ctx)).toBe('')
  })

  it('resolves matrix values', () => {
    expect(resolveValue('matrix.os', ctx)).toBe('ubuntu')
    expect(resolveValue('matrix.node', ctx)).toBe(20)
  })

  it('parses numeric literals', () => {
    expect(resolveValue('0', ctx)).toBe(0)
    expect(resolveValue('3.14', ctx)).toBe(3.14)
  })

  it('parses boolean literals', () => {
    expect(resolveValue('true', ctx)).toBe(true)
    expect(resolveValue('false', ctx)).toBe(false)
  })

  it('strips surrounding quotes from string literals', () => {
    expect(resolveValue('"hello"', ctx)).toBe('hello')
    expect(resolveValue("'world'", ctx)).toBe('world')
  })

  it('returns the raw path string for unrecognised paths', () => {
    expect(resolveValue('unknown.path', ctx)).toBe('unknown.path')
  })
})

describe('resolveExpression', () => {
  const ctx: ExpressionContext = {
    env: { NODE_ENV: 'production' },
    trigger: { type: 'push' },
    steps: {
      lint: {
        outputs: { passed: true, count: 7, label: 'ok', report: { errors: 0 } },
      },
    },
  }

  it('returns raw value when the whole string is a single expression (boolean)', () => {
    const result = resolveExpression('${{ steps.lint.outputs.passed }}', ctx)
    expect(result).toBe(true)
  })

  it('returns raw value when the whole string is a single expression (number)', () => {
    const result = resolveExpression('${{ steps.lint.outputs.count }}', ctx)
    expect(result).toBe(7)
  })

  it('returns raw value when the whole string is a single expression (object)', () => {
    const result = resolveExpression('${{ steps.lint.outputs.report }}', ctx)
    expect(result).toEqual({ errors: 0 })
  })

  it('returns a string when there is surrounding text mixed with an expression', () => {
    const result = resolveExpression('env=${{ env.NODE_ENV }}', ctx)
    expect(result).toBe('env=production')
    expect(typeof result).toBe('string')
  })

  it('returns a string when multiple expressions are present', () => {
    const result = resolveExpression(
      '${{ env.NODE_ENV }} / ${{ steps.lint.outputs.label }}',
      ctx,
    )
    expect(result).toBe('production / ok')
    expect(typeof result).toBe('string')
  })

  it('returns the original string when there are no expressions', () => {
    expect(resolveExpression('plain text', ctx)).toBe('plain text')
    expect(resolveExpression('  no braces  ', ctx)).toBe('  no braces  ')
  })

  it('handles whitespace inside expression delimiters', () => {
    const result = resolveExpression('${{  steps.lint.outputs.count  }}', ctx)
    expect(result).toBe(7)
  })
})

describe('interpolateObject', () => {
  const ctx: ExpressionContext = {
    env: { TAG: 'v1.2.3', DEBUG: 'false' },
    trigger: { type: 'tag' },
    steps: {
      test: {
        outputs: { passed: true, suite: 'unit', total: 42 },
      },
    },
  }

  it('interpolates top-level string values', () => {
    const result = interpolateObject(
      { tag: '${{ env.TAG }}', mode: 'release' },
      ctx,
    )
    expect(result.tag).toBe('v1.2.3')
    expect(result.mode).toBe('release')
  })

  it('preserves type of single-expression values (boolean)', () => {
    const result = interpolateObject(
      { ok: '${{ steps.test.outputs.passed }}' },
      ctx,
    )
    expect(result.ok).toBe(true)
  })

  it('preserves type of single-expression values (number)', () => {
    const result = interpolateObject(
      { total: '${{ steps.test.outputs.total }}' },
      ctx,
    )
    expect(result.total).toBe(42)
  })

  it('passes through non-string primitives unchanged', () => {
    const result = interpolateObject({ count: 99, flag: false, nothing: null }, ctx)
    expect(result.count).toBe(99)
    expect(result.flag).toBe(false)
    expect(result.nothing).toBeNull()
  })

  it('recursively interpolates nested objects', () => {
    const result = interpolateObject(
      {
        meta: {
          tag: '${{ env.TAG }}',
          suite: '${{ steps.test.outputs.suite }}',
        },
      },
      ctx,
    )
    expect((result.meta as Record<string, unknown>).tag).toBe('v1.2.3')
    expect((result.meta as Record<string, unknown>).suite).toBe('unit')
  })

  it('recursively interpolates elements inside arrays', () => {
    const result = interpolateObject(
      { tags: ['${{ env.TAG }}', 'latest', '${{ steps.test.outputs.suite }}'] },
      ctx,
    )
    expect(result.tags).toEqual(['v1.2.3', 'latest', 'unit'])
  })

  it('handles arrays of objects', () => {
    const result = interpolateObject(
      {
        steps: [
          { name: 'deploy', tag: '${{ env.TAG }}' },
          { name: 'verify', passed: '${{ steps.test.outputs.passed }}' },
        ],
      },
      ctx,
    )
    const steps = result.steps as Array<Record<string, unknown>>
    expect(steps[0]?.tag).toBe('v1.2.3')
    expect(steps[1]?.passed).toBe(true)
  })

  it('returns an empty object unchanged', () => {
    expect(interpolateObject({}, ctx)).toEqual({})
  })
})

describe('|| (logical OR / default value) operator', () => {
  const ctx: ExpressionContext = {
    env: { REGION: 'us-east-1' },
    trigger: {
      type: 'manual',
      payload: { mode: 'full', empty: '' },
    },
    steps: {
      build: {
        outputs: { version: '2.0.0', passed: true },
      },
    },
  }

  it('resolveExpression: returns value when present', () => {
    const result = resolveExpression("${{ trigger.payload.mode || 'heuristic' }}", ctx)
    expect(result).toBe('full')
  })

  it('resolveExpression: returns default when value is empty string', () => {
    const result = resolveExpression("${{ trigger.payload.empty || 'fallback' }}", ctx)
    expect(result).toBe('fallback')
  })

  it('resolveExpression: returns default when value is missing', () => {
    const result = resolveExpression("${{ trigger.payload.missing || 'default' }}", ctx)
    expect(result).toBe('default')
  })

  it('resolveExpression: chains multiple fallbacks', () => {
    const result = resolveExpression("${{ trigger.payload.missing || trigger.payload.empty || 'last' }}", ctx)
    expect(result).toBe('last')
  })

  it('resolveExpression: preserves non-string types', () => {
    const result = resolveExpression('${{ steps.build.outputs.passed || false }}', ctx)
    expect(result).toBe(true)
  })

  it('resolveExpression: returns numeric default', () => {
    const result = resolveExpression('${{ trigger.payload.missing || 42 }}', ctx)
    expect(result).toBe(42)
  })

  it('interpolateString: works in embedded expressions', () => {
    const result = interpolateString("Mode: ${{ trigger.payload.missing || 'heuristic' }}", ctx)
    expect(result).toBe('Mode: heuristic')
  })

  it('interpolateString: uses value when present', () => {
    const result = interpolateString("Mode: ${{ trigger.payload.mode || 'heuristic' }}", ctx)
    expect(result).toBe('Mode: full')
  })

  it('interpolateObject: works with || in object values', () => {
    const result = interpolateObject(
      { mode: "${{ trigger.payload.missing || 'heuristic' }}" },
      ctx,
    )
    expect(result.mode).toBe('heuristic')
  })

  it('evaluateExpression: || still works for boolean evaluation', () => {
    expect(evaluateExpression('false || true', ctx)).toBe(true)
    expect(evaluateExpression('false || false', ctx)).toBe(false)
  })

  it('handles || inside quotes (no split)', () => {
    // "hello || world" is a single quoted literal, should NOT split on ||
    const result = resolveExpression("${{ trigger.payload.missing || 'a || b' }}", ctx)
    expect(result).toBe('a || b')
  })
})

