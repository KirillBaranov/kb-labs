# Plan: Add `discoverSubRepos` helper to `core-sys`
## Table of Contents
- [Task](#task)
- [Background & Current State](#background-&-current-state)
- [Phase 1 — Define `SubRepo` type in `core-sys`](#phase-1-—-define-subrepo-type-in-core-sys)
- [Phase 2 — Implement `discoverSubRepos` in `repo.ts`](#phase-2-—-implement-discoversubrepos-in-repots)
- [Phase 3 — Export from barrel files](#phase-3-—-export-from-barrel-files)
- [Phase 4 — Add tests](#phase-4-—-add-tests)
- [Phase 5 — Update README](#phase-5-—-update-readme)
- [Risks](#risks)
- [Verification](#verification)
- [Approval](#approval)
## Task

**A →** `core-sys` exports only a path-based helper (`discoverSubRepoPaths → string[]`) and no `SubRepo` type.  
**→ B** `core-sys` gains a `discoverSubRepos(repoRoot: string): SubRepo[]` helper that returns structured objects `{ path, category, name, absolutePath }` alongside the existing path-only function, plus the `SubRepo` interface exported from the types barrel.

---

## Background & Current State

`core-sys` already has `discoverSubRepoPaths` (`platform/kb-labs-core/packages/core-sys/src/repo/repo.ts:50`) which returns `string[]` of absolute paths. Two callers today — `platform/kb-labs-workflow/packages/workflow-daemon/src/bootstrap.ts:78` and `platform/kb-labs-rest-api/apps/rest-api/src/bootstrap.ts:159` — both do `[repoRoot, ...discoverSubRepoPaths(repoRoot)]` just to get a flat list of roots. They get no structure back.

Separately, `plugins/kb-labs-impact-analysis-plugin/packages/impact-core/src/core/workspace.ts:23` implements `listSubRepos(): SubRepo[]` (returning `{ path, category, name }` objects), with the `SubRepo` type living in `@kb-labs/impact-contracts` (a plugin package). Any package that wants structured sub-repo info currently has to take a plugin dependency — which is architecturally wrong. The type and the discovery logic belong in the foundation layer (`core-sys`).

The new `discoverSubRepos` helper mirrors the algorithm in `workspace.ts:34–56` but lives in the right place and adds an `absolutePath` convenience field so callers don't have to `path.join(root, subrepo.path)` themselves.

---

## Phase 1 — Define `SubRepo` type in `core-sys`

**File:** `platform/kb-labs-core/packages/core-sys/src/types/types.ts` (currently 5 lines, add after `FindNearestConfigOpts`)

```typescript
export interface SubRepo {
  /** Relative path from repoRoot, e.g. "platform/kb-labs-core" */
  path: string;
  /** Parent segment(s) — e.g. "platform"; empty string for flat layout */
  category: string;
  /** Final directory name — e.g. "kb-labs-core" */
  name: string;
  /** Absolute path on disk — convenience; equals path.join(repoRoot, path) */
  absolutePath: string;
}
```

We add `absolutePath` as a convenience field that `discoverSubRepoPaths` users already get for free (it returns absolute paths). The impact-plugin's `SubRepo` omits it, forcing callers to reconstruct it. The two definitions are structurally compatible for future consolidation.

---

## Phase 2 — Implement `discoverSubRepos` in `repo.ts`

**File:** `platform/kb-labs-core/packages/core-sys/src/repo/repo.ts`

**Step 2a** — Add import at the top of the file (after line 8):
```typescript
import type { SubRepo } from '../types/index.js';
```

**Step 2b** — Append the new function at the end of the file (after the closing `}` of `discoverSubRepoPaths` at line 83):

```typescript
/**
 * Like discoverSubRepoPaths but returns structured SubRepo objects
 * with path, category, name, and absolutePath fields.
 */
export function discoverSubRepos(repoRoot: string): SubRepo[] {
  const gitmodulesPath = path.join(repoRoot, '.gitmodules');

  if (existsSync(gitmodulesPath)) {
    try {
      const content = readFileSync(gitmodulesPath, 'utf-8');
      const results: SubRepo[] = [];
      for (const match of content.matchAll(/^\s*path\s*=\s*(.+)$/gm)) {
        const relPath = (match[1] ?? '').trim();
        if (!relPath) continue;
        const absolutePath = path.join(repoRoot, relPath);
        if (!existsSync(absolutePath)) continue;
        const parts = relPath.split('/');
        const name = parts.at(-1) ?? relPath;
        const category = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
        results.push({ path: relPath, category, name, absolutePath });
      }
      if (results.length > 0) return results;
    } catch { /* fall through */ }
  }

  // Fallback: flat layout — top-level dirs with .git
  const results: SubRepo[] = [];
  try {
    for (const entry of readdirSync(repoRoot)) {
      if (entry.startsWith('.') || entry === 'node_modules') continue;
      const absolutePath = path.join(repoRoot, entry);
      try {
        if (statSync(absolutePath).isDirectory() &&
            existsSync(path.join(absolutePath, '.git'))) {
          results.push({ path: entry, category: '', name: entry, absolutePath });
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return results;
}
```

The parsing logic follows `impact-core/workspace.ts:34–56` exactly (regex on `.gitmodules`, split path segments for `category`/`name`), but lives in core-sys and adds `absolutePath`.

---

## Phase 3 — Export from barrel files

**No edits required** to either barrel:

- `platform/kb-labs-core/packages/core-sys/src/repo/index.ts` — already `export * from './repo.js'`, picks up the new function automatically.
- `platform/kb-labs-core/packages/core-sys/src/index.ts` — already `export * from './repo/index.js'` and `export * from './types/index.js'`, so both `discoverSubRepos` and `SubRepo` are re-exported at the package root.

---

## Phase 4 — Add tests

**File:** `platform/kb-labs-core/packages/core-sys/src/repo/__tests__/repo.spec.ts`

Add a new `describe` block after the existing `findRepoRoot` tests. The test harness (`mkd()` temp dir helper) is already defined in the file and can be reused.

```typescript
import { findRepoRoot, discoverSubRepos } from '../repo'

describe('discoverSubRepos', () => {
  it('parses .gitmodules and returns SubRepo objects', async () => {
    const root = await mkd()
    await fsp.writeFile(path.join(root, '.gitmodules'),
      '[submodule "my-plugin"]\n\tpath = plugins/my-plugin\n\turl = git@example.com\n')
    await fsp.mkdir(path.join(root, 'plugins/my-plugin'), { recursive: true })

    const repos = discoverSubRepos(root)
    expect(repos).toHaveLength(1)
    expect(repos[0]).toMatchObject({
      path: 'plugins/my-plugin',
      category: 'plugins',
      name: 'my-plugin',
    })
    expect(repos[0]!.absolutePath).toBe(path.join(root, 'plugins/my-plugin'))
  })

  it('falls back to flat layout scan when .gitmodules is absent', async () => {
    const root = await mkd()
    await fsp.mkdir(path.join(root, 'my-sub/.git'), { recursive: true })

    const repos = discoverSubRepos(root)
    expect(repos).toHaveLength(1)
    expect(repos[0]).toMatchObject({ path: 'my-sub', category: '', name: 'my-sub' })
    expect(repos[0]!.absolutePath).toBe(path.join(root, 'my-sub'))
  })

  it('returns empty array when no sub-repos exist', async () => {
    const root = await mkd()
    expect(discoverSubRepos(root)).toEqual([])
  })
})
```

---

## Phase 5 — Update README

**File:** `platform/kb-labs-core/packages/core-sys/README.md`

Two small edits:

1. **Quick Start code example** (around line 63) — add `discoverSubRepos` to the import and a usage line:
   ```typescript
   import { findRepoRoot, discoverSubRepos } from '@kb-labs/core-sys';
   const root = await findRepoRoot();
   const subRepos = discoverSubRepos(root); // [{ path, category, name, absolutePath }]
   ```

2. **Features > Repository section** (line 91) — add a bullet:
   ```
   - **Sub-repository Discovery**: Find all sub-repos with structured `path`, `category`, `name`, and `absolutePath` metadata
   ```

---

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `absolutePath` field makes `core-sys`'s `SubRepo` structurally incompatible with `impact-contracts`'s `SubRepo` | Low — structurally a superset, assignable in TypeScript | No action; if impact-contracts is ever migrated to import from core-sys, adding the field is a non-breaking extension |
| Existing callers of `discoverSubRepoPaths` (`workflow-daemon`, `rest-api`) don't automatically get the richer type | None — they continue to work unchanged | Note in PR description as an optional follow-up migration |
| `.gitmodules` entries that exist on disk without a `.git` marker (shallow checkouts) are filtered out | Low — matches current `discoverSubRepoPaths` behaviour | Acceptable; can be loosened in a follow-up if needed |

---

## Verification

Build `core-sys` (confirms TypeScript compilation and tsup bundle):
```
pnpm --filter @kb-labs/core-sys build
```

Run unit tests (should show 3 new passing cases in `repo.spec.ts`):
```
pnpm --filter @kb-labs/core-sys test
```

Type-check only (no emit):
```
pnpm --filter @kb-labs/core-sys type-check
```

Lint (confirms no unused imports, export issues):
```
pnpm --filter @kb-labs/core-sys lint
```

Verify the two downstream bootstrap files still compile after the package is rebuilt:
```
pnpm --filter @kb-labs/workflow-daemon build
```
```
pnpm --filter @kb-labs/rest-api-app build
```

---

## Approval

Plan is ready for user approval.
