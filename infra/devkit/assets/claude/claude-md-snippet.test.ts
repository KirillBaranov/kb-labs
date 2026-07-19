import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// kb-create merges this snippet into a fresh project's CLAUDE.md during
// install (tools/kb-create/internal/claude/claudemd.go), so a stale command
// here reaches every new user's onboarding doc verbatim.
const snippetPath = fileURLToPath(new URL('./CLAUDE.md.snippet', import.meta.url))
const snippet = readFileSync(snippetPath, 'utf8')

describe('CLAUDE.md.snippet', () => {
  it('does not reference the nonexistent `kb plugins list` command', () => {
    // The real command is under the marketplace plugin's `plugins` subgroup
    // (plugins/marketplace/entry/src/manifest.ts: 'marketplace plugins list').
    // `kb plugins list` was never a registered command and fails with
    // "Did you mean: kb marketplace plugins list".
    expect(snippet).not.toMatch(/`kb plugins list`/)
  })

  it('references the real `kb marketplace plugins list` command', () => {
    expect(snippet).toMatch(/`kb marketplace plugins list`/)
  })
})
