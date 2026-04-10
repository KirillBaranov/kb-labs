# Plan: Add `formatViolation` Helper to `policy-contracts`
## Table of Contents
- [Task](#task)
- [Current State](#current-state)
- [Steps](#steps)
  - [Phase 1 — Expose the public API (the only required code change)](#phase-1-—-expose-the-public-api-the-only-required-code-change)
  - [Phase 2 — Update `README.md` (optional, recommended)](#phase-2-—-update-readmemd-optional-recommended)
  - [`formatViolation(violation, options?)`](#formatviolationviolation-options)
- [Risks](#risks)
- [Verification](#verification)
- [Approval](#approval)
## Task

**A → B:**  
`formatViolation` (and `FormatViolationOptions`) are fully implemented in `src/format.ts` but not exported from the package's public entry point. After this change, consumers can `import { formatViolation } from '@kb-labs/policy-contracts'` without reaching into internal paths.

---

## Current State

The `policy-contracts` package lives at `plugins/kb-labs-policy-plugin/packages/policy-contracts/`.

| File | Status |
|---|---|
| `src/format.ts` | ✅ Fully implemented — `formatViolation()` + `FormatViolationOptions` (79 lines) |
| `src/error-codes.ts` | ✅ Fully implemented — `PolicyErrorCode`, `POLICY_ERROR_MESSAGES`, `getPolicyErrorMessage` (101 lines) |
| `tests/format-violation.test.ts` | ✅ Fully implemented — 17 test cases covering all options and edge cases |
| `src/index.ts` | ❌ Only exports `./types.js` and `./schema.js` — **missing `./format.js` and `./error-codes.js`** |

`src/index.ts` currently reads (lines 1–2):
```ts
export * from './types.js';
export * from './schema.js';
```

The test file today imports directly from `'../src/format.js'` (bypassing the barrel), so all 17 tests pass already — but the public API surface (`@kb-labs/policy-contracts`) does not yet expose `formatViolation`.

---

## Steps

### Phase 1 — Expose the public API (the only required code change)

**Edit `plugins/kb-labs-policy-plugin/packages/policy-contracts/src/index.ts` — append two export lines after line 2:**

```ts
export * from './types.js';
export * from './schema.js';
export * from './format.js';       // adds: formatViolation, FormatViolationOptions
export * from './error-codes.js';  // adds: PolicyErrorCode, POLICY_ERROR_MESSAGES, getPolicyErrorMessage
```

Both modules are already fully implemented and their exported names have no overlap with `types.ts` or `schema.ts`. Including `error-codes.ts` at the same time is the right call — it's a peer contract artifact sitting unused in the same package for the same reason.

### Phase 2 — Update `README.md` (optional, recommended)

**Edit `plugins/kb-labs-policy-plugin/packages/policy-contracts/README.md`** — add a brief usage example for `formatViolation`. The README currently documents types and schema only; adding an example section ensures consumers discover it via docs rather than by reading source.

```md
### `formatViolation(violation, options?)`

Formats a `PolicyViolation` into a human-readable string mirroring CLI output:

\`\`\`ts
import { formatViolation } from '@kb-labs/policy-contracts';

const line = formatViolation(violation);
// "[error] boundary-check — pkg-a depends on pkg-b"
\`\`\`
```

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Name collision between `format.ts` / `error-codes.ts` exports and existing barrel exports | Low | All new names (`formatViolation`, `FormatViolationOptions`, `PolicyErrorCode`, `POLICY_ERROR_MESSAGES`, `getPolicyErrorMessage`) are absent from `types.ts` and `schema.ts` — confirmed by reading all four files. The `type-check` step below will catch any collision at compile time. |
| Downstream consumers already importing `../src/format.js` directly | None | The barrel addition is purely additive; their direct imports remain valid. |
| Build or bundler not picking up the new entry | Low | `tsup.config.ts` entry is `['src/index.ts']`, so any symbol re-exported through `index.ts` is automatically bundled and declared. The `build` + `grep` steps below confirm the artifact. |

---

## Verification

Run these commands from the plugin workspace root (`plugins/kb-labs-policy-plugin/`):

1. **Run the existing test suite** — the 17 cases in `tests/format-violation.test.ts` must all pass:
   ```
   pnpm --filter @kb-labs/policy-contracts test
   ```

2. **Type-check** — confirms no type errors and no export name collisions:
   ```
   pnpm --filter @kb-labs/policy-contracts type-check
   ```

3. **Build** — confirms tsup compiles and emits correct `.d.ts` with `formatViolation` in the declaration:
   ```
   pnpm --filter @kb-labs/policy-contracts build
   ```

4. **Smoke-check the build artifact** — verify `formatViolation` is present in the emitted dist:
   ```
   grep -r "formatViolation" plugins/kb-labs-policy-plugin/packages/policy-contracts/dist/
   ```

5. **Run the consuming package's tests** — end-to-end confirmation that `policy-core` works with the updated public API:
   ```
   pnpm --filter @kb-labs/policy-core test
   ```

---

## Approval

Plan is ready for user approval.
