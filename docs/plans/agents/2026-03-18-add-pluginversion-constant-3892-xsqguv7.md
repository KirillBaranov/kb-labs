# Plan: Add `PLUGIN_VERSION` Constant
## Table of Contents
- [Task](#task)
- [Context & Current State](#context-&-current-state)
- [Steps / Phases](#steps-phases)
  - [Phase 1 — Define the constant in `manifest.ts`](#phase-1-—-define-the-constant-in-manifestts)
  - [Phase 2 — Update the error message in `manifest-loader.ts`](#phase-2-—-update-the-error-message-in-manifest-loaderts)
  - [Phase 3 — Export from the package's public surface](#phase-3-—-export-from-the-packages-public-surface)
  - [Phase 4 — (Optional) Re-export through the `@kb-labs/plugin-execution` facade](#phase-4-—-optional-re-export-through-the-@kb-labsplugin-execution-facade)
- [Risks](#risks)
- [Verification](#verification)
- [Approval](#approval)
## Task

**A →** The codebase has `PROTOCOL_VERSION = 1` (execution-wire protocol) and uses the string `'kb.plugin/3'` inline as a schema literal in `ManifestV3`, but there is no exported `PLUGIN_VERSION` constant that callers can import to reference the current plugin manifest schema version.

**→ B** Add a `PLUGIN_VERSION` constant to `infra/kb-labs-plugin/packages/plugin-contracts/src/manifest.ts`, export it from the package's public surface (`plugin-contracts/src/index.ts`), and make the inline `'kb.plugin/3'` literals in `manifest.ts` and `manifest-loader.ts` derive from it — single source of truth.

---

## Context & Current State

`@kb-labs/plugin-contracts` (`infra/kb-labs-plugin/packages/plugin-contracts/`) is the canonical, zero-runtime-dependency contracts layer for the V3 plugin system. It already exports runtime constants such as `DEFAULT_PERMISSIONS`, `ErrorCode`, `WIDGET_CATEGORIES`, etc. — so adding a constant follows the established pattern.

The manifest schema version string `'kb.plugin/3'` is currently hard-coded in three places:

| File | Line | Usage |
|------|------|-------|
| `plugin-contracts/src/manifest.ts` | 443 | `schema: 'kb.plugin/3'` — the `ManifestV3` field type |
| `plugin-contracts/src/manifest.ts` | 518 | `manifest.schema === 'kb.plugin/3'` — inside `isManifestV3()` |
| `plugin-contracts/src/manifest-loader.ts` | 17 | Error message string literal |

There is also `process.env.KB_PLUGIN_VERSION` in `platform/kb-labs-core/packages/core-sandbox/src/runner/initialization/observability-setup.ts:97` — that carries a **runtime semver** (e.g. `'1.2.3'`) of the loaded plugin binary, which is a completely different concept and is left untouched.

---

## Steps / Phases

### Phase 1 — Define the constant in `manifest.ts`

**File:** `infra/kb-labs-plugin/packages/plugin-contracts/src/manifest.ts`

Add two related constants after the import block (before the `SchemaRef` type at line 15):

```typescript
/** Full schema identifier for V3 plugin manifests. */
export const PLUGIN_VERSION = 'kb.plugin/3' as const;

/** Numeric schema version (for integer comparisons, analogous to PROTOCOL_VERSION). */
export const PLUGIN_SCHEMA_VERSION = 3 as const;
```

`PLUGIN_VERSION` captures the full schema string that appears on the wire and in `kb.plugin.json`. `PLUGIN_SCHEMA_VERSION` provides the bare integer, mirroring how `PROTOCOL_VERSION = 1` is defined in `plugin-execution-factory/src/types.ts:65`.

Then replace the two inline literals **in the same file**:

- **Line 443** — `schema: 'kb.plugin/3'` → `schema: typeof PLUGIN_VERSION`
  (using `typeof PLUGIN_VERSION` preserves the narrow `'kb.plugin/3'` literal type because the const is declared `as const`)
- **Line 518** — `manifest.schema === 'kb.plugin/3'` → `manifest.schema === PLUGIN_VERSION`

### Phase 2 — Update the error message in `manifest-loader.ts`

**File:** `infra/kb-labs-plugin/packages/plugin-contracts/src/manifest-loader.ts`

- Add `import { PLUGIN_VERSION } from './manifest.js';` at the top (after the existing `isManifestV3` import on line 6).
- **Line 17** — replace the hard-coded string with a template literal:

```typescript
`Invalid manifest: expected schema "${PLUGIN_VERSION}", got "${parsed.schema || 'unknown'}"`
```

The error message now automatically tracks the constant if the schema ever bumps to `'kb.plugin/4'`.

### Phase 3 — Export from the package's public surface

**File:** `infra/kb-labs-plugin/packages/plugin-contracts/src/index.ts`

The Manifest section (lines 224–246) exports types and functions from `manifest.ts`. Extend the existing value-export line (line 246):

```typescript
// Before:
export { isManifestV3, getHandlerPath, getHandlerPermissions } from './manifest.js';

// After:
export { isManifestV3, getHandlerPath, getHandlerPermissions, PLUGIN_VERSION, PLUGIN_SCHEMA_VERSION } from './manifest.js';
```

After this, `import { PLUGIN_VERSION } from '@kb-labs/plugin-contracts'` works for any downstream consumer.

### Phase 4 — (Optional) Re-export through the `@kb-labs/plugin-execution` facade

**File:** `infra/kb-labs-plugin/packages/plugin-execution/src/index.ts`

This facade (line 68) already re-exports `PROTOCOL_VERSION` from `./types.js`. If the team wants `PLUGIN_VERSION` equally discoverable from the top-level execution package, add one line after line 68:

```typescript
export { PLUGIN_VERSION, PLUGIN_SCHEMA_VERSION } from '@kb-labs/plugin-contracts';
```

This is optional — relevant only if execution-layer consumers currently import `plugin-contracts` symbols through the `plugin-execution` facade rather than directly.

---

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `schema: typeof PLUGIN_VERSION` could widen to `string` rather than preserving the literal type | Low | `as const` on the declaration ensures `typeof PLUGIN_VERSION` stays `'kb.plugin/3'`; existing TypeScript tests that rely on the literal will catch any regression |
| Existing consumers that already do `manifest.schema === 'kb.plugin/3'` won't break — this change is purely additive | N/A | Additive only; no call sites need updating |
| Tests that hard-code `'kb.plugin/3'` inline (e.g. fixture files) will still pass, but can optionally be migrated to use the constant for consistency | Very low | Out of scope for this PR; no behaviour change |

---

## Verification

```bash
# Build the contracts package (confirms types compile and exports are valid)
pnpm --filter @kb-labs/plugin-contracts build
```

```bash
# Run contracts package tests (covers isManifestV3, validateManifest, logger-metadata)
pnpm --filter @kb-labs/plugin-contracts test
```

```bash
# Build execution-factory (depends on plugin-contracts, confirms no type regressions)
pnpm --filter @kb-labs/plugin-execution-factory build
```

```bash
# Build the top-level execution facade
pnpm --filter @kb-labs/plugin-execution build
```

```bash
# Run execution tests (covers e2e-context, metadata-injection, context-structure, etc.)
pnpm --filter @kb-labs/plugin-execution test
```

```bash
# Confirm the constant appears in source (quick sanity check)
grep -r "PLUGIN_VERSION" infra/kb-labs-plugin/packages/plugin-contracts/src/
```

---

## Approval

The plan is ready for user approval.
