# Plan: Add `isPolicyPassing` Utility to `policy-contracts`
## Table of Contents
- [Task](#task)
- [Context](#context)
- [Steps](#steps)
  - [Phase 1 — Implement the function](#phase-1-—-implement-the-function)
  - [Phase 2 — Verify the export chain (no edit needed)](#phase-2-—-verify-the-export-chain-no-edit-needed)
  - [Phase 3 — Add tests](#phase-3-—-add-tests)
- [Risks](#risks)
- [Verification](#verification)
- [Approval](#approval)
## Task

**A → B**

- **A (current):** `@kb-labs/policy-contracts` has utility helpers in `plugins/kb-labs-policy-plugin/packages/policy-contracts/src/helpers.ts` (e.g. `getViolationSummary`), but no convenience function to tell a caller whether a `CheckReport` passed all policy checks.
- **B (target):** A new exported function `isPolicyPassing(report: CheckReport): boolean` is added to `src/helpers.ts`, automatically re-exported via `src/index.ts` (which already does `export * from './helpers.js'`), and covered by a new test file `tests/is-policy-passing.test.ts`.

---

## Context

`CheckReport` (defined in `plugins/kb-labs-policy-plugin/packages/policy-contracts/src/types.ts:19`) already carries a `passed: boolean` top-level field. The simplest correct implementation is a one-liner that returns `report.passed`. Wrapping it in a named function:

- makes intent explicit at call-sites (`isPolicyPassing(report)` vs `report.passed`)
- is consistent with the existing helper pattern in `helpers.ts` (`getViolationSummary`)
- keeps the boolean field an implementation detail — future logic changes (e.g. filtering only `error`-severity violations) stay in one place

The existing pattern in `helpers.ts` (lines 1–88) uses JSDoc with `@example` blocks — the new function should follow the same documentation style.

The `CheckReport` type is already imported at line 1 of `helpers.ts`:
```ts
import type { CheckReport, PolicyViolation, RepoCheckResult } from './types.js';
```
No import changes are needed.

---

## Steps

### Phase 1 — Implement the function

**Edit `plugins/kb-labs-policy-plugin/packages/policy-contracts/src/helpers.ts`**

Append after the closing `}` of `getViolationSummary` (after line 88):

```ts
/**
 * Returns `true` when every repo in the report passed all policy rules
 * (i.e. `report.passed === true`), `false` otherwise.
 *
 * @example
 * ```ts
 * import { isPolicyPassing } from '@kb-labs/policy-contracts';
 *
 * if (!isPolicyPassing(report)) {
 *   process.exit(1);
 * }
 * ```
 */
export function isPolicyPassing(report: CheckReport): boolean {
  return report.passed;
}
```

### Phase 2 — Verify the export chain (no edit needed)

`plugins/kb-labs-policy-plugin/packages/policy-contracts/src/index.ts` already contains `export * from './helpers.js';` (line 5). `isPolicyPassing` will be automatically re-exported from the package entry point — **no changes needed**.

### Phase 3 — Add tests

**Create `plugins/kb-labs-policy-plugin/packages/policy-contracts/tests/is-policy-passing.test.ts`**

Follow the structure of the existing `tests/get-violation-summary.test.ts` — import from `../src/helpers.js`, define minimal `CheckReport` fixtures:

```ts
import { describe, expect, it } from 'vitest';
import { isPolicyPassing } from '../src/helpers.js';
import type { CheckReport } from '../src/types.js';

const passingReport: CheckReport = {
  passed: true,
  repos: [],
  summary: { total: 2, passed: 2, failed: 0, violations: 0 },
};

const failingReport: CheckReport = {
  passed: false,
  repos: [],
  summary: { total: 2, passed: 1, failed: 1, violations: 3 },
};

describe('isPolicyPassing', () => {
  it('returns true for a passing report', () => {
    expect(isPolicyPassing(passingReport)).toBe(true);
  });
  it('returns false for a failing report', () => {
    expect(isPolicyPassing(failingReport)).toBe(false);
  });
});
```

Test cases cover:
1. `true` when `report.passed === true` (all repos clean)
2. `false` when `report.passed === false` (one or more repos violated)

TypeScript strict compilation (Phase 2 verification) validates the return type at build time.

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Name collision — another symbol named `isPolicyPassing` already exported from a sibling file | Low | TypeScript will error on duplicate export names at build time; caught by `type-check` |
| `CheckReport.passed` semantics change in future (e.g. `null` for "not yet run") | Low | The wrapper isolates the change; only `isPolicyPassing` needs updating if the field type changes |

---

## Verification

```bash
# 1. Build the package — confirms TypeScript compiles cleanly and exports are correct
pnpm --filter @kb-labs/policy-contracts build

# 2. Type-check without emitting (fast feedback, catches return-type mismatches)
pnpm --filter @kb-labs/policy-contracts type-check

# 3. Run all tests in the package (includes the new is-policy-passing.test.ts)
pnpm --filter @kb-labs/policy-contracts test
```

---

## Approval

This plan is ready for user approval.
