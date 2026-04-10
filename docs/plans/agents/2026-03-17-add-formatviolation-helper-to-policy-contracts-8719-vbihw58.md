# Plan: Add `formatViolation` Helper to `policy-contracts`
## Table of Contents
- [Task](#task)
- [Current State](#current-state)
- [Steps](#steps)
  - [Phase 1 — Create `src/formatters.ts`](#phase-1-—-create-srcformattersts)
  - [Phase 2 — Export `formatters.ts` and `error-codes.ts` from `index.ts`](#phase-2-—-export-formattersts-and-error-codests-from-indexts)
  - [Phase 3 — Add unit tests](#phase-3-—-add-unit-tests)
  - [Phase 4 (Optional) — Update `check.ts` to use `formatViolation`](#phase-4-optional-—-update-checkts-to-use-formatviolation)
- [Risks](#risks)
- [Verification](#verification)
- [Approval](#approval)
## Task

**A → B:**  
A: `@kb-labs/policy-contracts` has the `PolicyViolation` type and `PolicyErrorCode` constants, but no helper to turn a violation into a human-readable string.  
B: `@kb-labs/policy-contracts` exports a `formatViolation(violation: PolicyViolation): string` helper — a pure, dependency-free utility that produces a consistent string representation of any violation.

---

## Current State

The package lives at `plugins/kb-labs-policy-plugin/packages/policy-contracts/` and currently has four source files:

| File | Role |
|---|---|
| `src/types.ts` | `PolicyViolation`, `PolicySeverity`, `CheckReport`, etc. |
| `src/error-codes.ts` | `PolicyErrorCode` enum-object + `POLICY_ERROR_MESSAGES` map + `getPolicyErrorMessage()` — **never exported from `index.ts`** |
| `src/schema.ts` | Zod schemas for config parsing |
| `src/index.ts` | Only re-exports `types.ts` and `schema.ts` (lines 1-2) |

`PolicyViolation` (in `src/types.ts:3-10`) has: `rule`, `severity`, `message`, and optional `package`, `detail`, `file`.

Consumers (e.g. `policy-core/src/cli/commands/check.ts:71-75`) currently hand-roll their own formatting:
```ts
lines.push(`  ❌ ${violation.rule}`);
lines.push(`     ${violation.message}`);
if (violation.detail) lines.push(`     → ${violation.detail}`);
```

This duplication is exactly what `formatViolation` will eliminate.

---

## Steps

### Phase 1 — Create `src/formatters.ts`

Create a new file at `plugins/kb-labs-policy-plugin/packages/policy-contracts/src/formatters.ts`.

The function receives a `PolicyViolation` and returns a readable string. The format mirrors the pattern already used in `check.ts:71-75` so callers can migrate without visual regressions:

```ts
import type { PolicyViolation } from './types.js';

export function formatViolation(violation: PolicyViolation): string {
  const icon = violation.severity === 'error' ? '❌' : '⚠️';
  const location = violation.file ? ` (${violation.file})` : '';
  const pkg = violation.package ? ` [${violation.package}]` : '';
  let out = `${icon} [${violation.rule}]${pkg}${location}: ${violation.message}`;
  if (violation.detail) out += `\n   → ${violation.detail}`;
  return out;
}
```

Intentionally simple: one `PolicyViolation` in, one `string` out. No side effects, no external dependencies beyond the local type import.

---

### Phase 2 — Export `formatters.ts` and `error-codes.ts` from `index.ts`

Edit `plugins/kb-labs-policy-plugin/packages/policy-contracts/src/index.ts` — append two lines after the existing exports on lines 1-2:

```ts
export * from './types.js';
export * from './schema.js';
export * from './error-codes.js';   // ← was defined but never exported
export * from './formatters.js';    // ← new
```

This also fixes the pre-existing oversight that `PolicyErrorCode`, `POLICY_ERROR_MESSAGES`, and `getPolicyErrorMessage` (all in `src/error-codes.ts:10-100`) were defined but never exported from the package's public surface.

---

### Phase 3 — Add unit tests

Create `plugins/kb-labs-policy-plugin/packages/policy-contracts/tests/formatters.test.ts`.

The test file should cover these cases:

1. **Error severity** → output starts with `❌`, contains `[rule]`, `message`.
2. **Warning severity** → output starts with `⚠️`.
3. **Optional `detail` field** → appended on next line as `   → <detail>`.
4. **Optional `file` field** → appears as `(src/index.ts)` in the output.
5. **Optional `package` field** → appears as `[@kb-labs/core]` in the output.
6. **No optional fields** → no stray parentheses or brackets in output.

```ts
import { describe, expect, it } from 'vitest';
import { formatViolation } from '../src/formatters.js';

describe('formatViolation', () => {
  it('formats an error violation with all fields', () => {
    const result = formatViolation({
      rule: 'boundary-check',
      severity: 'error',
      message: 'Illegal cross-boundary import',
      package: '@kb-labs/core',
      file: 'src/index.ts',
      detail: 'plugins may not import platform packages directly',
    });
    expect(result).toContain('❌');
    expect(result).toContain('[boundary-check]');
    expect(result).toContain('[@kb-labs/core]');
    expect(result).toContain('(src/index.ts)');
    expect(result).toContain('Illegal cross-boundary import');
    expect(result).toContain('plugins may not import platform packages directly');
  });

  it('uses ⚠️ for warnings', () => {
    const result = formatViolation({ rule: 'no-rollback', severity: 'warning', message: 'version dip' });
    expect(result).toContain('⚠️');
    expect(result).not.toContain('❌');
  });

  it('omits optional fields when absent', () => {
    const result = formatViolation({ rule: 'sdk-only-deps', severity: 'error', message: 'bad import' });
    expect(result).not.toContain('→');
    expect(result).not.toContain('(');
    expect(result).not.toContain('[sdk-only-deps]');  // rule is in brackets; package would add extra
  });
});
```

---

### Phase 4 (Optional) — Update `check.ts` to use `formatViolation`

Once the helper exists, the hand-rolled formatting in `plugins/kb-labs-policy-plugin/packages/policy-core/src/cli/commands/check.ts:71-75` can be replaced:

```ts
// Before (lines 71-75):
lines.push(`  ❌ ${violation.rule}`);
lines.push(`     ${violation.message}`);
if (violation.detail) lines.push(`     → ${violation.detail}`);

// After:
import { formatViolation } from '@kb-labs/policy-contracts';
// ...
lines.push(`  ${formatViolation(violation)}`);
```

This phase validates the helper is usable end-to-end and eliminates the duplication. It can be a follow-up PR if preferred.

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Emoji rendering differs across terminals | Low | Cosmetic only; consumers who need plain text can inspect `violation.severity` directly |
| Adding `error-codes.ts` export surfaces a name collision | Very low | All symbols use the `Policy` prefix; no known conflicts in the package graph |
| Phase 4 `check.ts` migration subtly changes CLI output layout | Low | Phase 4 is optional; the new format aligns with the existing pattern, just consolidated |

---

## Verification

After implementing all changes, run the following from the monorepo root:

```bash
# Type-check the contracts package (catches import/type errors in formatters.ts)
pnpm --filter @kb-labs/policy-contracts type-check

# Build the contracts package (ensures index.ts exports compile cleanly)
pnpm --filter @kb-labs/policy-contracts build

# Run new unit tests for formatViolation
pnpm --filter @kb-labs/policy-contracts test

# Build policy-core to confirm no breakage from the new exports
pnpm --filter @kb-labs/policy-core build

# Run full policy-core test suite (catches any regressions if Phase 4 is applied)
pnpm --filter @kb-labs/policy-core test
```

---

## Approval

The plan is ready for user approval.
