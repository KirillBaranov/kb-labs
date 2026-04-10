# Plan: Add `PLUGIN_VERSION` Constant to `policy-contracts`
## Table of Contents
- [Task](#task)
- [Current State](#current-state)
- [Steps / Phases](#steps-phases)
  - [Phase 1 — Create `src/version.ts`](#phase-1-—-create-srcversionts)
  - [Phase 2 — Re-export from the barrel `src/index.ts`](#phase-2-—-re-export-from-the-barrel-srcindexts)
  - [Phase 3 — Confirm the existing test assertions are satisfied](#phase-3-—-confirm-the-existing-test-assertions-are-satisfied)
- [Risks](#risks)
- [Verification](#verification)
- [Approval](#approval)
## Task

**A → B:**  
A. `policy-contracts` has no `PLUGIN_VERSION` constant and no `src/version.ts` file. The existing test at `plugins/kb-labs-policy-plugin/packages/policy-contracts/tests/contracts.manifest.test.ts` already imports `contractsVersion` from `../src/version` — so that test is broken until this file is created.  
B. `policy-contracts` exports a `PLUGIN_VERSION` constant (and an aligned `contractsVersion` alias) from a dedicated `src/version.ts` module, re-exported through the package's barrel `src/index.ts`.

---

## Current State

`plugins/kb-labs-policy-plugin/packages/policy-contracts/src/` currently contains:

| File | Purpose |
|---|---|
| `index.ts` (2 lines) | Barrel — exports `./types.js` and `./schema.js` only |
| `types.ts` | TypeScript interfaces & type aliases |
| `schema.ts` | Zod schemas and derived input types |
| `error-codes.ts` | `PolicyErrorCode` const-object + helper |
| `format.ts` | `formatViolation()` utility |

There is **no** `version.ts`. The package version is `"0.1.0"` (defined in `package.json:3`). The plugin manifest in `policy-core/src/manifest.v3.ts:40` also hardcodes `version: '0.1.0'`.

The test file `tests/contracts.manifest.test.ts:4` already has:
```ts
import { contractsVersion } from '../src/version';
```
and at line 20–23 checks it against a semver regex — this import is currently unresolvable.

---

## Steps / Phases

### Phase 1 — Create `src/version.ts`

**File to create:** `plugins/kb-labs-policy-plugin/packages/policy-contracts/src/version.ts`

This file is the single source of truth for the plugin's contracts version. Two names are exported:
- `PLUGIN_VERSION` — the canonical constant requested by the task.
- `contractsVersion` — an alias that satisfies the existing test import at `tests/contracts.manifest.test.ts:4` without requiring a test-file edit.

```ts
/** Semver version of the @kb-labs/policy-contracts public API. */
export const PLUGIN_VERSION = '0.1.0' as const;

/** Alias for PLUGIN_VERSION — used in manifest validation tests. */
export const contractsVersion = PLUGIN_VERSION;
```

The value `'0.1.0'` mirrors `packages/policy-contracts/package.json:3`.

---

### Phase 2 — Re-export from the barrel `src/index.ts`

**File to edit:** `plugins/kb-labs-policy-plugin/packages/policy-contracts/src/index.ts`

The file currently has exactly 2 lines (lines 1–2). Insert `export * from './version.js';` as line 3:

```ts
export * from './types.js';
export * from './schema.js';
export * from './version.js';   // ← add on line 3
```

This makes `PLUGIN_VERSION` (and `contractsVersion`) part of the public API surface that consumers get when they `import { PLUGIN_VERSION } from '@kb-labs/policy-contracts'`.

---

### Phase 3 — Confirm the existing test assertions are satisfied

The test at `tests/contracts.manifest.test.ts:20–23` verifies:

```ts
it('uses a semver-compatible contractsVersion', () => {
  const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/;
  expect(semverPattern.test(contractsVersion)).toBe(true);
});
```

With `contractsVersion = '0.1.0'`, the regex passes. No changes to the test file are needed.

> **Note:** The same test file also imports `pluginContractsManifest` from `../src/contract` and `parsePluginContracts` from `../src/schema/contract.schema` — these modules don't exist either, but they are **out of scope** for this task. Those failures are pre-existing; this plan does not worsen them.

---

## Risks

| Risk | Mitigation |
|---|---|
| Hardcoded `'0.1.0'` can drift from `package.json` | Acceptable for now; a follow-up could use `import pkg from '../package.json'` with `resolveJsonModule: true` in tsconfig. |
| `contracts.manifest.test.ts` has other missing imports unrelated to this task | Pre-existing; the `PLUGIN_VERSION`/`contractsVersion` test cases will pass once Phase 1–2 are done. |
| Barrel re-export name collision | No other file exports `PLUGIN_VERSION` or `contractsVersion` today — no conflict. |

---

## Verification

Run all commands from inside `plugins/kb-labs-policy-plugin/`:

```bash
# Confirm the new file was created with the correct content
cat plugins/kb-labs-policy-plugin/packages/policy-contracts/src/version.ts
```

```bash
# Type-check the contracts package in isolation
pnpm --filter @kb-labs/policy-contracts type-check
```

```bash
# Build the contracts package (output goes to dist/)
pnpm --filter @kb-labs/policy-contracts build
```

```bash
# Run the contracts tests (the contractsVersion semver assertion should now pass)
pnpm --filter @kb-labs/policy-contracts test
```

```bash
# Full plugin build + test to ensure nothing regressed across both packages
cd plugins/kb-labs-policy-plugin && pnpm build && pnpm test
```

---

## Approval

Plan is ready for user approval.
