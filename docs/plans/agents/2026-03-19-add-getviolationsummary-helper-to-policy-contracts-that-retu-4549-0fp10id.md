# Plan: Add `getViolationSummary` helper to `policy-contracts`
## Table of Contents
- [Task](#task)
- [Current State](#current-state)
- [Implementation](#implementation)
  - [Phase 1 — Confirm implementation integrity (read-only checks)](#phase-1-—-confirm-implementation-integrity-read-only-checks)
  - [Phase 2 — Run verification](#phase-2-—-run-verification)
- [Verification](#verification)
- [Risks](#risks)
- [Approval](#approval)
## Task

**From → To:** Add a `getViolationSummary(violations)` helper to `@kb-labs/policy-contracts` (located at `plugins/kb-labs-policy-plugin/packages/policy-contracts/`) that accepts policy violations and returns a `Record<string, number>` mapping each rule identifier to its violation count.

---

## Current State

After reading every source file in the package, **the feature is already fully implemented and shipped**. Here is a concrete inventory of what exists:

| File | What's already there |
|------|---------------------|
| `plugins/kb-labs-policy-plugin/packages/policy-contracts/src/helpers.ts` | `ViolationSummary` type at line 16; three overloads + implementation of `getViolationSummary` at lines 36–88 |
| `plugins/kb-labs-policy-plugin/packages/policy-contracts/src/index.ts:5` | `export * from './helpers.js';` — publicly re-exports both the type and the function from the package root |
| `plugins/kb-labs-policy-plugin/packages/policy-contracts/tests/get-violation-summary.test.ts` | 205-line test suite with 4 `describe` blocks covering all three overloads and the return-value contract |

**What's in `src/helpers.ts`:**

- `ViolationSummary` (line 16): `export type ViolationSummary = Record<string, number>` — only rules with ≥1 violation appear as keys, so `Object.keys(summary).length === 0` is a reliable empty-check.
- Three overloads declared at lines 36, 50, and 65:
  - `getViolationSummary(violations: PolicyViolation[]): ViolationSummary` — flat array
  - `getViolationSummary(result: RepoCheckResult): ViolationSummary` — single-repo result, reads `.violations`
  - `getViolationSummary(report: CheckReport): ViolationSummary` — full multi-repo report, flat-maps across `report.repos[n].violations`
- Implementation body at lines 67–88: discriminates overloads using `Array.isArray` and `'repos' in input`, then accumulates counts with `summary[v.rule] = (summary[v.rule] ?? 0) + 1`.

**What's in `src/index.ts`:**

```
Line 1: export * from './types.js';
Line 2: export * from './schema.js';
Line 3: export * from './error-codes.js';
Line 4: export * from './format.js';
Line 5: export * from './helpers.js';   ← ViolationSummary + getViolationSummary
```

**Build config:** `tsup.config.ts` sets `entry: ['src/index.ts']` and `dts: { resolve: true }`, so `dist/index.d.ts` emits both symbols after `pnpm build`.

---

## Implementation

Because the feature is already complete, **no source-code changes are needed**. The steps below are verification-only — confirm each file contains the expected content and then run the test suite.

### Phase 1 — Confirm implementation integrity (read-only checks)

1. **`src/helpers.ts`**: Verify line 16 contains `export type ViolationSummary = Record<string, number>;` and lines 36–88 contain the three overload signatures and the implementation body. ✅ Confirmed.

2. **`src/index.ts:5`**: Verify the line reads `export * from './helpers.js';` so consumers importing from `@kb-labs/policy-contracts` receive both `ViolationSummary` and `getViolationSummary`. ✅ Confirmed.

3. **`vitest.config.ts:9`**: Verify `include: ['tests/**/*.test.ts']` picks up `tests/get-violation-summary.test.ts` automatically. ✅ Confirmed.

If any of the above is found missing upon re-inspection (e.g., after a rebase or merge conflict), the concrete fixes are:

- **If `helpers.ts` is absent:** create `src/helpers.ts` with `ViolationSummary` type and `getViolationSummary` overloads as described above.
- **If `index.ts` export is absent:** add `export * from './helpers.js';` to `plugins/kb-labs-policy-plugin/packages/policy-contracts/src/index.ts` after line 4.
- **If test file is absent:** create `plugins/kb-labs-policy-plugin/packages/policy-contracts/tests/get-violation-summary.test.ts` with test cases for all three overloads (empty array → `{}`, same-rule accumulation, cross-repo aggregation, return-value contract).

### Phase 2 — Run verification

See the Verification section below.

---

## Verification

```bash
# 1. Enter the plugin workspace
cd plugins/kb-labs-policy-plugin
```

```bash
# 2. Type-check — verifies helpers.ts has no TypeScript errors (overload signatures, type imports)
pnpm --filter @kb-labs/policy-contracts type-check
```
Expected: exits 0, zero diagnostics.

```bash
# 3. Run the full test suite — includes get-violation-summary.test.ts (205 lines, 4 describe blocks, ~13 it-cases)
pnpm --filter @kb-labs/policy-contracts test
```
Expected: all tests pass, output shows `4 describe blocks`, no failures.

```bash
# 4. Build — emits dist/index.js and dist/index.d.ts; confirms ViolationSummary and getViolationSummary are in the public API
pnpm --filter @kb-labs/policy-contracts build
```
Expected: `dist/index.d.ts` contains `export type ViolationSummary` and `export declare function getViolationSummary`.

```bash
# 5. Full workspace quality check (lint + type-check + test across all packages in the plugin)
pnpm check
```
Expected: exits 0 across all packages.

---

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| `tests/contracts.manifest.test.ts` imports from `src/contract` and `src/schema/contract.schema` — files not found in the `src/` listing during research — and may cause the test run to fail at the suite level before `get-violation-summary.test.ts` even runs | Low–Medium | Investigate those imports separately; they are unrelated to this feature. `get-violation-summary.test.ts` only imports from `src/helpers.js` and `src/types.js`, both confirmed to exist |
| A consumer package already imports `getViolationSummary` directly from a deep path (e.g. `@kb-labs/policy-contracts/helpers`) | Low | `package.json` exports map exposes `"."` and `"./dist/*"`, so deep `dist/helpers.js` imports are technically accessible; no breakage expected |

---

## Approval

The requested feature — `getViolationSummary` returning violation counts grouped by rule — is **already implemented, exported, and tested** inside `plugins/kb-labs-policy-plugin/packages/policy-contracts/`. The `ViolationSummary` type and all three overloads live in `src/helpers.ts` (lines 16–88), are re-exported from `src/index.ts:5`, and are covered by a 205-line test file in `tests/get-violation-summary.test.ts`. No source changes are required — only the verification commands above need to be run.

**Plan is ready for user approval.**
