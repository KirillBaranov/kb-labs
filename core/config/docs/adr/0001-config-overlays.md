# ADR-0001 (core-config): Config overlays via `.kb/overlays/*.jsonc`

- **Status:** Accepted
- **Date:** 2026-05-25
- **Scope:** `@kb-labs/core-config`, `@kb-labs/core-runtime`
- **Related:** ADR-0012 (Platform/Project scope), ADR-0013 (Installer config placement), ClickUp [869deb27v](https://app.clickup.com/t/869deb27v)

## Context

`loadPlatformConfig` resolves the effective `PlatformConfig` from two layered sources:

1. `<platformRoot>/.kb/kb.config.json` — platform defaults (installer-owned).
2. `<projectRoot>/.kb/kb.config.json` — project overrides (user-owned).

Merged with `mergeWithFieldPolicy` per `CONFIG_FIELD_SCOPE` (ADR-0012).

This works for the steady state but breaks down for two recurring needs:

- **e2e scenarios.** A test suite needs to run the platform under a non-default configuration (raised broker limits, alternative adapter, multi-tenant variation). Today this is implemented via env flags read inside production code (`KB_GATEWAY_CONFIG_PATH`), jq patches in `e2e/platform/entrypoint.sh`, fixture JSON files, and `test.skip(!process.env.X)` guards on each spec. Every new scenario adds another ad-hoc knob.
- **Ad-hoc local tweaks.** Developers occasionally need to override a config field for a single run without editing the committed `kb.config.json`. Today the only option is editing the file and remembering to revert.

Both call for a **third config layer** that:

- is a file (declarative, observable, reversible by deletion);
- lives in `.kb/` (the established convention for KB runtime state);
- merges on top of the resolved platform↔project config without changing the existing merge policy;
- supports JSONC (comments, trailing commas) — same as `kb.config.jsonc`;
- can compose: multiple overlays apply in deterministic order;
- has merge semantics suitable for **fields that already use arrays** (adapter lists, routing rules) — i.e. distinct from `mergeDefined`, which concatenates arrays.

## Decision

`loadPlatformConfig` reads every `.kb/overlays/*.jsonc` file in the project root, in lexicographic order, and applies each as a deep-merge layer on top of the merged platform↔project config, before `${ENV_VAR}` interpolation.

### Merge semantics (`mergeOverlay`)

- **Plain objects** — recursive merge (overlay keys add to or replace base keys).
- **Scalars** — overlay wins.
- **Arrays** — **replace by default** (overlay array fully substitutes the base array). This is the opposite default from `mergeDefined`. We use a separate function (`mergeOverlay`) rather than parametrising the existing merge: the platform↔project layers genuinely *do* want concatenation in some cases, while overlays are conceptually "the final say".
- **Directive `kb:merge`** — a sibling key inside an object switches the strategy for selected array fields. Only one strategy is supported in MVP:

  ```jsonc
  // base
  { "adapters": { "llm": ["openai"] } }

  // overlay
  {
    "adapters": {
      "kb:merge": { "llm": "append" },
      "llm": ["vibeproxy"]
    }
  }

  // result
  { "adapters": { "llm": ["openai", "vibeproxy"] } }
  ```

  The `kb:merge` key is consumed and never appears in the result. Unknown strategies (`prepend`, `unique`, `by-key`) throw at merge time — explicit failure beats silent corruption.

The directive shape mirrors Kustomize's `$patch: replace` convention: a sibling rule co-located with the data it modifies. This keeps overlays diff-friendly — a reader sees both the data and the merge intent in the same block.

### File discovery and order

- Glob: `<projectRoot>/.kb/overlays/*.jsonc`. Non-`.jsonc` files in the directory are ignored.
- Order: ASCII lexicographic by file name. Later files override earlier ones.
- A malformed `.jsonc` file is reported as a diagnostic but does not abort the load — the file is skipped, the load continues with the remaining overlays. This is consistent with how `readJsonWithDiagnostics` handles malformed `kb.config.jsonc`.
- A file whose top-level value is not a JSON object (e.g. an array or scalar) is rejected with diagnostic code `OVERLAY_NOT_OBJECT`.

### Validation

After all overlays are applied, the merged config is validated against a minimal AJV schema registered under `'platform'` (`registerProductSchema`). The schema enforces only the top-level shape (`adapters`, `adapterOptions`, `core`, `execution`, `platform` are all objects when present); sub-properties remain `additionalProperties: true`. This catches the failure mode that overlays make easy ("overlay sets `adapters: \"string\"` and the runtime crashes deep inside an adapter factory") without coupling the loader to the full PlatformConfig surface — adding a new adapter slot does not require a schema update.

Validation failure throws a single `Error` with a concatenated list of AJV violations. The caller (CLI bootstrap, service bootstrap) sees a clear message naming the overlay layer, not a mysterious stack trace from `initPlatform`.

### Observability

`LoadPlatformConfigResult.sources.overlays` carries the absolute paths of overlays that were applied, in order. Absent when no overlay files were present.

## Layer order (final)

```
platformDir/.kb/kb.config.jsonc       ← platform defaults
  ↓  mergeWithFieldPolicy (ADR-0012)
projectDir/.kb/kb.config.jsonc        ← project overrides
  ↓  mergeOverlay × N  (this ADR)
projectDir/.kb/overlays/*.jsonc       ← overlays (lex order)
  ↓  validateProductConfig('platform')
  ↓  interpolateConfig (${ENV_VAR})
effective PlatformConfig
```

Overlays are intentionally *after* platform↔project policy merge: they can override `platform-only` fields (like `core` and `execution`) that the project layer cannot. Overlays are an escape hatch for cases where the policy is too strict — e2e scenarios in particular need to twist execution settings the project layer is forbidden to touch.

## Non-goals

- **Programmatic overlays.** Code-driven mutations (`setOverlay(merged)`) are explicitly not provided. Overlays are files. This keeps "what is the current effective config?" answerable by looking at the filesystem.
- **Extended directive vocabulary.** `prepend`, `unique`, `by-key` may be useful later; they are not added speculatively.
- **JSON Patch (RFC 6902).** Powerful but unreadable in JSONC. Out of scope.
- **Overlay validation against a strict schema.** The minimal schema catches structural breakage; it does not enforce that overlay values are semantically valid. Adapter packages remain responsible for validating their own slice of `adapterOptions`.

## Consequences

- New `.kb/overlays/` directory under the project root. Documented under the same `.kb/` convention as `kb.config.jsonc` and `marketplace.lock`. Should be `.gitignore`d by default for ephemeral local use, but committable in test fixtures that need to ship a scenario.
- `kb-dev ensure --scenario` (separate component, see ClickUp epic) writes to `.kb/overlays/` to apply test scenarios. Removing the directory is the documented way to reset to the unaltered platform↔project config.
- Existing config consumers see no change unless `.kb/overlays/` is populated. The added validation step can theoretically reject configs that were previously accepted, but the schema is permissive enough that this only happens when the top-level type is wrong — which would have crashed downstream anyway.

## Implementation notes

- `core/config/src/overlay/merge.ts` — `mergeOverlay`, directive parsing.
- `core/config/src/overlay/loader.ts` — `loadOverlays(projectRoot)`.
- `core/runtime/src/config-loader.ts` — hook between `mergeWithFieldPolicy` and `interpolateConfig`.
- `core/runtime/src/schema/platform-config-schema.ts` — minimal AJV schema, side-effect registration.
- Tests: `core/config/src/__tests__/overlay-{merge,loader}.spec.ts`, `core/runtime/src/__tests__/config-loader-overlays.test.ts`.
