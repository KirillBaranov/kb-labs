# Plan: Add `mergeViolations` to `@kb-labs/policy-contracts`
## Table of Contents
- [Task](#task)
- [Context](#context)
- [Steps / Phases](#steps-phases)
  - [Phase 1 — Implement `mergeViolations` in `src/helpers.ts`](#phase-1-—-implement-mergeviolations-in-srchelpersts)
  - [Phase 2 — Add tests in `tests/merge-violations.test.ts`](#phase-2-—-add-tests-in-testsmerge-violationstestts)
- [Risks](#risks)
- [Verification](#verification)
- [Approval](#approval)
## Task

Add a `mergeViolations(reports: CheckReport[]): CheckReport` utility function to the `@kb-labs/policy-contracts` package that accepts any number of `CheckReport` objects and returns a single consolidated `CheckReport`. The merged report must have a correctly recomputed `summary` and a top-level `passed` flag that is `true` only if there are zero violations across all inputs.

**A → B:**

- **A (before):** `policy-contracts` has `getViolationSummary` and `isPolicyPassing` in `helpers.ts`. There is no way to combine multiple `CheckReport` objects returned by separate policy runs.
- **B (after):** `policy-contracts` exports a new `mergeViolations` function that accepts `CheckReport[]` and returns a merged `CheckReport`, plus a matching test file.

---

## Context

All relevant files are in `plugins/kb-labs-policy-plugin/packages/policy-contracts/`.

Key types (`CheckReport`, `RepoCheckResult`, `PolicyViolation`) live in `src/types.ts`:

```ts
interface CheckReport {
  passed: boolean;
  repos: RepoCheckResult[];   // each repo has .violations[] and .passed[]
  summary: { total: number; passed: number; failed: number; violations: number };
}
```

Existing helpers (`getViolationSummary`, `isPolicyPassing`) live in `src/helpers.ts` and are re-exported from `src/index.ts` via `export * from './helpers.js'` — so **no change to `index.ts` is needed**; the new export will flow through automatically.

The merge strategy for repos: **concatenate** all `repos` arrays from all input reports. This is the simplest correct approach — each repo entry already carries its own `path` and `category` for identification. This mirrors how `getViolationSummary` already uses `flatMap((r) => r.violations)` without deduplication. Callers who need dedup-by-path can layer that on top.

---

## Steps / Phases

### Phase 1 — Implement `mergeViolations` in `src/helpers.ts`

**Step 1.1 — Locate the end of `isPolicyPassing` in `plugins/kb-labs-policy-plugin/packages/policy-contracts/src/helpers.ts` (currently line 107) and append `mergeViolations` immediately below it.**

No new imports are needed — `CheckReport` and `RepoCheckResult` are already imported at line 1 of `helpers.ts`.

The logic:
1. Flatten all `repos` from every input report with `flatMap((r) => r.repos)`.
2. Recompute the four `summary` counters from the merged repos array.
3. Set top-level `passed = violations === 0`.

```ts
/**
 * Merges multiple {@link CheckReport} objects into a single consolidated report.
 *
 * All `repos` arrays are concatenated in input order. The `summary` counters
 * (`total`, `passed`, `failed`, `violations`) are recomputed from the merged
 * repo list. The top-level `passed` flag is `true` only when the merged result
 * has **zero** violations.
 *
 * @example
 * ```ts
 * import { mergeViolations } from '@kb-labs/policy-contracts';
 *
 * const combined = mergeViolations([reportA, reportB]);
 * // combined.repos === [...reportA.repos, ...reportB.repos]
 * // combined.passed === (combined.summary.violations === 0)
 * ```
 */
export function mergeViolations(reports: CheckReport[]): CheckReport {
  const repos = reports.flatMap((r) => r.repos);
  const total = repos.length;
  const failed = repos.filter((r) => r.violations.length > 0).length;
  const passedRepos = total - failed;
  const violations = repos.reduce((acc, r) => acc + r.violations.length, 0);
  return {
    passed: violations === 0,
    repos,
    summary: { total, passed: passedRepos, failed, violations },
  };
}
```

The edge case `mergeViolations([])` naturally returns `{ passed: true, repos: [], summary: { total: 0, passed: 0, failed: 0, violations: 0 } }` — correct by inspection, no special-casing needed.

---

### Phase 2 — Add tests in `tests/merge-violations.test.ts`

**Step 2.1 — Create `plugins/kb-labs-policy-plugin/packages/policy-contracts/tests/merge-violations.test.ts`**

Follow the same conventions as `tests/get-violation-summary.test.ts`: const fixture objects at the top, a `makeRepo()` factory function, `describe` blocks grouped by scenario. Import from `'../src/helpers.js'` and `'../src/types.js'` (matching the `.js` extension convention used throughout the package).

Test cases to cover:

| Scenario | Assertions |
|---|---|
| `mergeViolations([])` | `passed: true`, empty `repos`, all summary counters = 0 |
| Single clean report (no violations) | `passed: true`, repos preserved, summary matches |
| Single failing report | `passed: false`, `violations` count correct |
| Two clean reports | `passed: true`, `repos` is ordered concatenation of both |
| One clean + one failing | `passed: false`, `total` = sum of both, `violations` summed |
| Two failing reports | All violations aggregated across repos |
| Three reports | Repo order is preserved (report[0] repos first, then [1], then [2]) |
| `summary.total` | Equals sum of all repos across input reports |
| `summary.passed` (count) | Counts repos with zero violations — distinct from the top-level `passed` boolean |
| Immutability | The original input reports' `.repos` arrays are not mutated by the call |

Skeleton structure (abbreviated):

```ts
import { describe, expect, it } from 'vitest';
import { mergeViolations } from '../src/helpers.js';
import type { CheckReport, PolicyViolation, RepoCheckResult } from '../src/types.js';

const sdkError: PolicyViolation = { rule: 'sdk-only-deps', severity: 'error', message: 'pkg-a imports core' };
const boundaryWarn: PolicyViolation = { rule: 'boundary-check', severity: 'warning', message: 'pkg-b' };

function makeRepo(path: string, violations: PolicyViolation[], passed: string[] = []): RepoCheckResult {
  return { path, category: 'platform', violations, passed };
}

function makeReport(repos: RepoCheckResult[]): CheckReport {
  const violations = repos.reduce((a, r) => a + r.violations.length, 0);
  const failed = repos.filter((r) => r.violations.length > 0).length;
  return {
    passed: violations === 0,
    repos,
    summary: { total: repos.length, passed: repos.length - failed, failed, violations },
  };
}

describe('mergeViolations', () => {
  it('returns a clean zeroed report for an empty array', () => { /* ... */ });
  it('passes through a single clean report', () => { /* ... */ });
  // ... full scenarios as outlined above
});
```

---

## Risks

1. **Repo deduplication ambiguity.** If two input reports both contain a result for the same repo `path`, the merged `repos` will have two entries for that path. The current design (concatenate) is intentional and documented in the JSDoc. If callers need dedup-by-path in the future, an optional options parameter can be added without breaking the current signature.

2. **`summary.passed` vs `CheckReport.passed` naming collision.** `summary.passed` is a _count_ of repos with zero violations; `CheckReport.passed` is a top-level _boolean_. The implementation uses a distinct local variable (`passedRepos`) and sets `CheckReport.passed` separately from `violations === 0` — the distinction is made explicit in code.

3. **No import changes needed.** `mergeViolations` only uses `CheckReport` and `RepoCheckResult`, both already imported at `helpers.ts:1`. No additional imports are required.

---

## Verification

Run from the repo root using pnpm filter. Expected outcome in each case: all tests pass with no TypeScript errors and no build failures.

```bash
pnpm --filter @kb-labs/policy-contracts type-check
```

```bash
pnpm --filter @kb-labs/policy-contracts test
```

```bash
pnpm --filter @kb-labs/policy-contracts build
```

```bash
pnpm --filter kb-labs-policy-plugin test
```

---

## Approval

Plan is ready for user approval.
