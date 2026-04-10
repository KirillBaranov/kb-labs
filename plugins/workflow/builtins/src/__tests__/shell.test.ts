/**
 * Unit tests for the shell built-in output extraction.
 *
 * `mergeJsonOutputs` is private inside shell.ts, so we reproduce the
 * same logic here and verify the expected contract.
 */
import { describe, it, expect, expectTypeOf } from 'vitest'
import type { ShellInput, ShellOutput } from '../shell'

// ---------------------------------------------------------------------------
// Constants — must match shell.ts
// ---------------------------------------------------------------------------
const OUTPUT_MARKER = '::kb-output::'

// ---------------------------------------------------------------------------
// Inline mirror of the private mergeJsonOutputs function.
// Any change to the logic in shell.ts must be reflected here.
// ---------------------------------------------------------------------------
function mergeJsonOutputs(output: ShellOutput): Record<string, unknown> {
  const base: Record<string, unknown> = { ...output }
  const trimmed = output.stdout.trim()
  if (!trimmed) {
    return base
  }

  // Priority 1: Look for ::kb-output:: marker lines
  const lines = output.stdout.split('\n')
  let foundMarker = false
  for (const line of lines) {
    const idx = line.indexOf(OUTPUT_MARKER)
    if (idx !== -1) {
      foundMarker = true
      try {
        const parsed = JSON.parse(line.slice(idx + OUTPUT_MARKER.length))
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          Object.assign(base, parsed)
        }
      } catch {
        // Malformed marker — skip
      }
    }
  }

  if (foundMarker) {
    return base
  }

  // Priority 2: Fallback — entire stdout as JSON (backward compat)
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      Object.assign(base, parsed)
    }
  } catch {
    // Not JSON — return as-is
  }
  return base
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeOutput(stdout: string, exitCode = 0): ShellOutput {
  return {
    stdout,
    stderr: '',
    exitCode,
    ok: exitCode === 0,
  }
}

// ---------------------------------------------------------------------------
// Tests: ::kb-output:: marker (primary mechanism)
// ---------------------------------------------------------------------------
describe('mergeJsonOutputs — ::kb-output:: marker', () => {
  it('extracts outputs from ::kb-output:: marker line', () => {
    const output = makeOutput('some logs\n::kb-output::{"passed":true,"score":95}\nmore logs')
    const result = mergeJsonOutputs(output)

    expect(result.passed).toBe(true)
    expect(result.score).toBe(95)
  })

  it('works with marker as the only line', () => {
    const output = makeOutput('::kb-output::{"status":"ok"}')
    const result = mergeJsonOutputs(output)

    expect(result.status).toBe('ok')
  })

  it('extracts from marker even with pnpm noise before it', () => {
    const stdout = [
      'WARN  Issue while reading "/Users/x/.npmrc".',
      '> @kb-labs/workspace@0.0.1 kb /path',
      '> node ./platform/kb-labs-cli/packages/cli-bin/dist/bin.js "policy:check"',
      'Running checks...',
      '::kb-output::{"passed":true,"violations":0}',
    ].join('\n')
    const result = mergeJsonOutputs(makeOutput(stdout))

    expect(result.passed).toBe(true)
    expect(result.violations).toBe(0)
  })

  it('merges multiple marker lines', () => {
    const stdout = [
      '::kb-output::{"a":1}',
      'log line',
      '::kb-output::{"b":2}',
    ].join('\n')
    const result = mergeJsonOutputs(makeOutput(stdout))

    expect(result.a).toBe(1)
    expect(result.b).toBe(2)
  })

  it('later marker overrides earlier for same key', () => {
    const stdout = [
      '::kb-output::{"passed":false}',
      '::kb-output::{"passed":true}',
    ].join('\n')
    const result = mergeJsonOutputs(makeOutput(stdout))

    expect(result.passed).toBe(true)
  })

  it('skips malformed marker JSON without crashing', () => {
    const stdout = [
      '::kb-output::not json',
      '::kb-output::{"valid":true}',
    ].join('\n')
    const result = mergeJsonOutputs(makeOutput(stdout))

    expect(result.valid).toBe(true)
  })

  it('ignores marker with array JSON', () => {
    const stdout = '::kb-output::[1,2,3]'
    const result = mergeJsonOutputs(makeOutput(stdout))

    expect(result[0]).toBeUndefined()
  })

  it('preserves base ShellOutput fields', () => {
    const output = makeOutput('logs\n::kb-output::{"custom":"value"}')
    const result = mergeJsonOutputs(output)

    expect(result.stdout).toBe('logs\n::kb-output::{"custom":"value"}')
    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.ok).toBe(true)
    expect(result.custom).toBe('value')
  })

  it('marker takes priority over fallback JSON parse', () => {
    // stdout ends with valid JSON but also has marker — marker wins
    const stdout = '::kb-output::{"source":"marker"}\n{"source":"fallback"}'
    const result = mergeJsonOutputs(makeOutput(stdout))

    expect(result.source).toBe('marker')
  })
})

// ---------------------------------------------------------------------------
// Tests: Fallback (entire stdout as JSON — backward compat)
// ---------------------------------------------------------------------------
describe('mergeJsonOutputs — fallback (backward compat)', () => {
  it('merges a flat JSON object from stdout into the output record', () => {
    const output = makeOutput('{"passed": true, "score": 95}')
    const result = mergeJsonOutputs(output)

    expect(result.passed).toBe(true)
    expect(result.score).toBe(95)
  })

  it('preserves the base ShellOutput fields even when merging', () => {
    const output = makeOutput('{"custom": "value"}')
    const result = mergeJsonOutputs(output)

    expect(result.stdout).toBe('{"custom": "value"}')
    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.ok).toBe(true)
    expect(result.custom).toBe('value')
  })

  it('ignores invalid JSON and returns the base output unchanged', () => {
    const output = makeOutput('not json at all')
    const result = mergeJsonOutputs(output)

    expect(result.stdout).toBe('not json at all')
    expect(Object.keys(result)).toEqual(['stdout', 'stderr', 'exitCode', 'ok'])
  })

  it('ignores partial / malformed JSON and returns the base output unchanged', () => {
    const output = makeOutput('{"key": }')
    const result = mergeJsonOutputs(output)

    expect(result.stdout).toBe('{"key": }')
    expect(result.key).toBeUndefined()
  })

  it('does NOT merge JSON arrays — only plain objects are merged', () => {
    const output = makeOutput('[1, 2, 3]')
    const result = mergeJsonOutputs(output)

    expect(result[0]).toBeUndefined()
    expect(result.stdout).toBe('[1, 2, 3]')
  })

  it('does NOT merge primitive JSON values (string, number, boolean)', () => {
    expect(mergeJsonOutputs(makeOutput('"hello"')).stdout).toBe('"hello"')
    expect(Object.keys(mergeJsonOutputs(makeOutput('"hello"')))).toEqual([
      'stdout', 'stderr', 'exitCode', 'ok',
    ])
    expect(mergeJsonOutputs(makeOutput('42')).stdout).toBe('42')
    expect(mergeJsonOutputs(makeOutput('true')).stdout).toBe('true')
  })

  it('returns base output unchanged when stdout is empty', () => {
    const result = mergeJsonOutputs(makeOutput(''))
    expect(result).toEqual({ stdout: '', stderr: '', exitCode: 0, ok: true })
  })

  it('returns base output unchanged when stdout is only whitespace', () => {
    const result = mergeJsonOutputs(makeOutput('   \n  '))
    expect(result.stdout).toBe('   \n  ')
    expect(Object.keys(result)).toEqual(['stdout', 'stderr', 'exitCode', 'ok'])
  })

  it('merges nested objects from JSON stdout', () => {
    const output = makeOutput('{"meta": {"version": "1.0", "stable": true}}')
    const result = mergeJsonOutputs(output)

    expect(result.meta).toEqual({ version: '1.0', stable: true })
  })

  it('handles stdout with leading/trailing whitespace around valid JSON', () => {
    const output = makeOutput('  {"trimmed": true}  ')
    const result = mergeJsonOutputs(output)

    expect(result.trimmed).toBe(true)
  })

  it('works correctly when command fails (exitCode != 0)', () => {
    const output = makeOutput('{"error": "something went wrong"}', 1)
    const result = mergeJsonOutputs(output)

    expect(result.error).toBe('something went wrong')
    expect(result.ok).toBe(false)
    expect(result.exitCode).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Type shape tests
// ---------------------------------------------------------------------------
describe('ShellInput type shape', () => {
  it('accepts a minimal input with only command', () => {
    const input: ShellInput = { command: 'echo hello' }
    expectTypeOf(input.command).toBeString()
    expectTypeOf(input.env).toEqualTypeOf<Record<string, string> | undefined>()
    expectTypeOf(input.timeout).toEqualTypeOf<number | undefined>()
    expectTypeOf(input.throwOnError).toEqualTypeOf<boolean | undefined>()
  })

  it('accepts a fully specified input', () => {
    const input: ShellInput = {
      command: 'npm test',
      env: { NODE_ENV: 'test' },
      timeout: 60000,
      throwOnError: true,
    }
    expect(input.command).toBe('npm test')
    expect(input.timeout).toBe(60000)
  })
})

describe('ShellOutput type shape', () => {
  it('has the expected fields', () => {
    const output: ShellOutput = {
      stdout: 'hello',
      stderr: '',
      exitCode: 0,
      ok: true,
    }
    expectTypeOf(output.stdout).toBeString()
    expectTypeOf(output.stderr).toBeString()
    expectTypeOf(output.exitCode).toBeNumber()
    expectTypeOf(output.ok).toBeBoolean()
  })
})
