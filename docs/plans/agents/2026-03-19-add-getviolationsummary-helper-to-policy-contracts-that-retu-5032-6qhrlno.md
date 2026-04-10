# Plan: Add `getViolationSummary` to `@kb-labs/policy-contracts`
## Table of Contents
- [Task](#task)
- [Current State](#current-state)
- [Steps / Phases](#steps-phases)
  - [Phase 1 — Create `src/helpers.ts`](#phase-1-—-create-srchelpersts)
  - [Phase 2 — Export from barrel `src/index.ts`](#phase-2-—-export-from-barrel-srcindexts)
  - [Phase 3 — Add test file](#phase-3-—-add-test-file)
- [Risks](#risks)
- [Verification](#verification)
- [Approval](#approval)
## Task

**A →** `@kb-labs/policy-contracts` has helpers for formatting violations (`formatViolation` in `src/format.ts`) and looking up error messages (`getPolicyErrorMessage` in `src/error-codes.ts`), but no utility that aggregates violations by rule name.

**→ B** Add a `getViolationSummary` helper that accepts a flat `PolicyViolation[]`, a single `RepoCheckResult`, or a full `CheckReport`, and returns a `Record<string, number>` mapping each rule identifier to the count of violations it produced.

---

## Current State

The package lives at `plugins/kb-labs-policy-plugin/packages/policy-contracts/`. Its source tree is:

```
src/
  constants.ts        — PLUGIN_VERSION constant
  error-codes.ts      — PolicyErrorCode enum + getPolicyErrorMessage()
  format.ts           — FormatViolationOptions + formatViolation()
  index.ts            — barrel re-exporting all four modules
  schema.ts           — Zod schemas for config types
  types.ts            — PolicyViolation, RepoCheckResult, CheckReport, …
tests/
  format-violation.test.ts       — 10 vitest cases for formatViolation
  contracts.manifest.test.ts     — manifest schema validation
```

The `PolicyViolation` interface (`src/types.ts:3-10`) has `rule: string` as the natural grouping key. `RepoCheckResult` (`src/types.ts:12-17`) holds `violations: PolicyViolation[]`, and `CheckReport` (`src/types.ts:19-27`) holds `repos: RepoCheckResult[]`. The helper will operate on all three levels of this type hierarchy — matching the usage patterns already present.

The established pattern (as seen in `format.ts` and `error-codes.ts`) is: one concern per file, export the auxiliary type alongside the function, re-export everything from `index.ts`.

The vitest config at `vitest.config.ts:9` picks up `tests/**/*.test.ts` automatically — no config change needed for the new test file.

---

## Steps / Phases

### Phase 1 — Create `src/helpers.ts`

**Create** `plugins/kb-labs-policy-plugin/packages/policy-contracts/src/helpers.ts`.

This file introduces two exports: the `ViolationSummary` type alias and the `getViolationSummary` function. We expose three typed overloads to cover every natural call site (raw violations array, single repo result, full report), mirroring the `PolicyViolation` → `RepoCheckResult` → `CheckReport` type hierarchy that already drives the rest of the package.

```typescript
import type { CheckReport, PolicyViolation, RepoCheckResult } from './types.js';

/**
 * A mapping from rule identifier to the total number of violations produced
 * by that rule. Only rules with at least one violation appear as keys.
 */
export type ViolationSummary = Record<string, number>;

// Overload 1 — flat array (e.g. inside a single rule check)
export function getViolationSummary(violations: PolicyViolation[]): ViolationSummary;
// Overload 2 — single repo result
export function getViolationSummary(result: RepoCheckResult): ViolationSummary;
// Overload 3 — full report, aggregates across all repos
export function getViolationSummary(report: CheckReport): ViolationSummary;

export function getViolationSummary(
  input: PolicyViolation[] | RepoCheckResult | CheckReport,
): ViolationSummary {
  let violations: PolicyViolation[];

  if (Array.isArray(input)) {
    violations = input;
  } else if ('repos' in input) {                                     // CheckReport has `repos`, RepoCheckResult does not
    violations = (input as CheckReport).repos.flatMap((r) => r.violations);
  } else {
    violations = (input as RepoCheckResult).violations;
  }

  const summary: ViolationSummary = {};
  for (const v of violations) {
    summary[v.rule] = (summary[v.rule] ?? 0) + 1;
  }
  return summary;
}
```

Key design decisions:
- **Overload discrimination**: `Array.isArray` first, then `'repos' in input` — `repos` is unique to `CheckReport` (not present on `RepoCheckResult`), so the guard is unambiguous.
- **Sparse map**: rules with zero violations are absent; `Object.keys(summary).length === 0` is the natural emptiness check.
- **No new dependencies**: imports only from `./types.js`, which is already in the package.

---

### Phase 2 — Export from barrel `src/index.ts`

**Edit** `plugins/kb-labs-policy-plugin/packages/policy-contracts/src/index.ts` — currently 5 lines, add one line at the end:

```diff
  export * from './types.js';
  export * from './schema.js';
  export * from './error-codes.js';
  export * from './format.js';
+ export * from './helpers.js';
```

This makes both `ViolationSummary` and `getViolationSummary` available as top-level named exports from `@kb-labs/policy-contracts`, consistent with how `formatViolation` and `getPolicyErrorMessage` are already exposed.

---

### Phase 3 — Add test file

**Create** `plugins/kb-labs-policy-plugin/packages/policy-contracts/tests/get-violation-summary.test.ts`.

The file mirrors the structure of `format-violation.test.ts` — fixtures at the top, then `describe` blocks per overload, then a return-value contract group. Here is the full layout with all test cases spelled out:

```typescript
import { describe, expect, it } from 'vitest';
import { getViolationSummary } from '../src/helpers.js';
import type { CheckReport, PolicyViolation, RepoCheckResult } from '../src/types.js';

// --- fixtures ---
const sdkError: PolicyViolation  = { rule: 'sdk-only-deps',  severity: 'error',   message: 'pkg-a imports core' };
const sdkError2: PolicyViolation = { rule: 'sdk-only-deps',  severity: 'error',   message: 'pkg-d imports core' };
const boundary: PolicyViolation  = { rule: 'boundary-check', severity: 'warning', message: 'pkg-b → plugins' };
const rollback: PolicyViolation  = { rule: 'no-rollback',    severity: 'error',   message: 'version rolled back' };

function makeRepo(path: string, violations: PolicyViolation[], passed: string[] = []): RepoCheckResult {
  return { path, category: 'platform', violations, passed };
}

// --- describe('getViolationSummary(PolicyViolation[])') ---
//   it('returns {} for empty array')                              // line ~20
//   it('counts a single violation')                               // line ~23
//   it('accumulates same-rule violations')                        // line ~26
//   it('counts distinct rules independently')                     // line ~30
//   it('handles three different rules')                           // line ~35
//   it('omits absent rules from the result')                      // line ~40
//   it('all counts are positive integers')                        // line ~45

// --- describe('getViolationSummary(RepoCheckResult)') ---
//   it('returns {} when repo has no violations')                  // line ~55
//   it('counts violations from the repo')                         // line ~60
//   it('ignores the passed[] list')                               // line ~65

// --- describe('getViolationSummary(CheckReport)') ---
//   it('returns {} when no repos have violations')                // line ~75
//   it('aggregates violations across all repos')                  // line ~85
//   it('handles mixed passing/failing repos')                     // line ~95
//   it('returns {} for empty repos array')                        // line ~103
//   it('sums the same rule across multiple repos')                // line ~108

// --- describe('return-value contract') ---
//   it('result is a plain object, not null, not an array')        // line ~118
//   it('is JSON-serialisable')                                    // line ~123
```

Representative cases from the `CheckReport` group to show expected outputs:

```typescript
it('aggregates violations across all repos', () => {
  const report: CheckReport = {
    passed: false,
    repos: [
      makeRepo('platform/kb-labs-core', [sdkError, boundary]),
      makeRepo('plugins/kb-labs-agents', [sdkError2, rollback]),
    ],
    summary: { total: 2, passed: 0, failed: 2, violations: 4 },
  };
  expect(getViolationSummary(report)).toEqual({
    'sdk-only-deps': 2,
    'boundary-check': 1,
    'no-rollback': 1,
  });
});
```

17 `it()` cases in total, all passing on a green build.

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| A future `repos` field added to `RepoCheckResult` would break the overload discriminator | Low | Types are stable public contracts; the `'repos' in input` guard at `src/helpers.ts` line ~25 is the only line to revisit if types evolve |
| Name collision with a future `ViolationSummary` type elsewhere in the workspace | Very low | Scoped to `@kb-labs/policy-contracts`; no other package currently defines it |
| `tsup` tree-shaking silently drops the new export | Not applicable | `tsup.config.ts:8` already has `dts: { resolve: true }`; `entry: ['src/index.ts']` bundles all barrel re-exports |

---

## Verification

Build the package in isolation to confirm tsup emits the new export:

```bash
pnpm --filter @kb-labs/policy-contracts build
```

Confirm both symbols appear in the generated declarations:

```bash
grep -n "getViolationSummary\|ViolationSummary" plugins/kb-labs-policy-plugin/packages/policy-contracts/dist/index.d.ts
```

Run the full test suite — the vitest config will auto-discover the new test file via `tests/**/*.test.ts`:

```bash
pnpm --filter @kb-labs/policy-contracts test
```

Type-check without emitting (catches any type errors in the overload implementation):

```bash
pnpm --filter @kb-labs/policy-contracts type-check
```

Run the entire policy-plugin workspace to catch cross-package regressions:

```bash
cd plugins/kb-labs-policy-plugin && pnpm test
```

Expected: all existing tests continue to pass, and the 17 new test cases in `get-violation-summary.test.ts` all pass with no type errors.

---

## Approval

Plan is ready for user approval.
