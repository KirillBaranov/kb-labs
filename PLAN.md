Confirmed — the feature is not implemented. Here's the plan.

PIPELINE_STATUS: NEEDS_IMPLEMENTATION

## Summary
Add a new `kb config show` CLI command that calls the existing `loadPlatformConfig()` from `core/runtime/src/config-loader.ts` and renders the effective config with per-field provenance (platform/project/ignored), plus a `--json` mode exposing the raw `sources` object. No merge logic needs to be reimplemented — the loader already computes everything.

## Root cause / context
`loadPlatformConfig()` already returns `effectiveConfig`, `sources.fields` (per-field provenance: `'platform' | 'project' | 'both'`), `sources.ignoredProjectFields`, `sources.platformDirOverride`, and `sameLocation` — but nothing in the CLI surfaces it. `kb diag` (`cli/commands/src/commands/system/diag.ts`) checks environment/plugins/cache but never touches config provenance. There is no `config` command directory under `cli/commands/src/commands/`, and no existing test (Go e2e or `core/runtime` unit test) asserts on `sources.fields`/`sources.ignoredProjectFields` content directly, nor on `sameLocation: true` behavior for `kb config show` specifically.

## Implementation steps
1. **`cli/commands/src/commands/system/config/show.ts`** (new) — define `kb config show` via `defineSystemCommand` (pattern from `diag.ts`/`platform/sync.ts`). Call `loadPlatformConfig()` from `@kb-labs/core-runtime`. Build:
   - text output: table rendered via `ctx.ui` with columns `SOURCE | FIELD | VALUE`, one row per entry in `sources.fields` (value pulled from `effectiveConfig` by field path), plus rows for each `sources.ignoredProjectFields` entry marked `ignored` (value shown = platform's).
   - `--json` output: raw object `{ config: effectiveConfig, sources, sameLocation, platformRoot, projectRoot }`.
2. Register the command — check `cli/commands/src/registry/service.ts` to confirm auto-discovery of `commands/system/config/*.ts`, or add explicit registration if required (follow whatever `platform/sync.ts` does for `kb platform sync`).
3. Add a small path-flattening helper to walk `sources.fields` keys (which may be nested like `adapters.llm`) and resolve the corresponding value out of `effectiveConfig` for the text table — check if `config-loader.ts` already exports such a helper before writing a new one.
4. **`core/runtime/src/__tests__/config-loader.test.ts`** — add a same-root/dev-mode test case asserting: when `platformRoot === projectRoot` (`sameLocation: true`), every key in `sources.fields` is `'both'` and `sources.ignoredProjectFields` is empty.
5. **`tools/kb-create/e2e/e2e_test.go`** — extend/add a test reusing `TestInstallYes`'s two-`t.TempDir()` setup: run `kb config show --json` from `projectDir`, assert JSON output's `sources.fields` attributes `adapters`/`execution` to `'platform'` and a project-added mergeable field (e.g. `services.studio`) to `'project'`/`'both'`; then edit project config to add a platform-only field (e.g. `execution.mode`) and assert it shows up in `sources.ignoredProjectFields`.

## Tests / verification
- `pnpm --filter @kb-labs/core-runtime test` — run the new/existing config-loader unit tests covering `sameLocation: true` provenance.
- `cd tools/kb-create/e2e && go test -run TestInstallYes` (or the new test name) to verify split-root `kb config show --json` provenance and ignored-field reporting.
- Manually run `kb config show` and `kb config show --json` in both a monorepo (dogfood, same-root) checkout and an installed pointer-mode project to visually confirm table/JSON output matches the issue's suggested shape.
- Per repo bug-fix rule, the same-root unit test must be shown failing before the command/logic exists (or before any provenance fix) and passing after.