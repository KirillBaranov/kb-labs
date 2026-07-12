I have enough context. Here's the plan.

PIPELINE_STATUS: NEEDS_IMPLEMENTATION

## Summary
Add a new `kb config show` CLI command that wraps `loadPlatformConfig()` from `core/runtime/src/config-loader.ts` and renders the effective config with per-field provenance (platform/project/both/ignored), with mandatory redaction of sensitive values. Confirmed via grep that no `config` command directory or `show.ts` file exists anywhere in `cli/commands/src/commands` — the prior "issue-257-auto" branch work was wiped by a force-reset, so this must be built from scratch.

## Root cause / context
`loadPlatformConfig()` already computes and returns everything the command needs: the merged config, `sources.fields` (per-field provenance), `sources.ignoredProjectFields`, `sources.platformDirOverride`, and `sameLocation`. There is currently no CLI surface exposing this — `kb diag` covers environment/marketplace health but not config provenance, and `kb --help` in an installed (non-monorepo) project has no config-related command at all. The fix is purely additive: a thin rendering command, no changes to merge logic.

## Implementation steps
1. **`cli/commands/src/commands/system/config/show.ts`** (new file, new `config/` subdir alongside `platform/`, `auth/`, etc.)
   - Use `defineSystemCommand` (pattern from `diag.ts`) to register `kb config show`.
   - Call `loadPlatformConfig()` to get `{ config, sources, sameLocation }`.
   - Build provenance rows: for each field, look up `sources.fields[field]` (platform/project/both). For each entry in `sources.ignoredProjectFields`, add a row with source `ignored`, value taken from the platform's resolved config for that field (per issue note: "ignored value from `rawConfig.platform[field]`" — pull the actual raw platform value, not the merged one, since merged already reflects the winning platform value but the ignored row should make clear project's attempt was dropped).
   - Add a `SENSITIVE_FIELD_PATTERN = /key|secret|token|password|jwt|credential/i` matched against field name (dotted path segments). Recursively redact matched values (including inside nested objects/arrays) to `'***REDACTED***'` — apply this redaction to both the `--json` payload and the text table, and to `ignored` rows too.
   - `--output text` (default): render an ASCII/aligned table `SOURCE | FIELD | VALUE` sorted by source then field, using the same table helpers other commands use (check `@kb-labs/shared-cli-ui` for existing table rendering, mirror whatever `diag.ts`/`health.ts` use).
   - `--json`: emit the redacted `{ config, sources, sameLocation }` shape directly (or a normalized `{ fields: [...] }` array) — no re-parsing needed downstream.
2. **Register the command** — find how `diag.ts`, `health.ts` etc. get wired into the command registry (likely auto-discovered via manifest/directory convention under `commands/system/`; check `cli/commands/src/registry` or a manifest file listing commands) and ensure `config/show.ts` is discovered the same way. Add a `config/index.ts` or group manifest if the `webhook/`, `platform/` subdirs use one (check `cli/commands/src/commands/system/groups.ts`).
3. **Redaction helper** — extract `SENSITIVE_FIELD_PATTERN` + recursive redact function into a small local helper (in `show.ts` or a co-located `redact.ts`) since it's only used here; don't over-engineer into a shared package unless an existing redaction utility already exists (grep for `REDACTED` first to avoid duplicating one).
4. **Core/runtime test** — add a `sameLocation: true` case to `core/runtime/src/__tests__/config-loader.test.ts` (or `-overlays.test.ts`) asserting: all fields in `sources.fields` report `'both'`, and `sources.ignoredProjectFields` is always empty when `platformRoot === projectRoot`.
5. **kb-create e2e (Go)** — extend `tools/kb-create/e2e/e2e_test.go`, reusing `TestInstallYes`'s two-`t.TempDir()` setup (split platformDir/projectDir), to add a case running `kb config show --json` from `projectDir` and asserting: platform-owned fields (`adapters`, `execution`) are attributed to `platform`; a project-added mergeable field (e.g. `services.studio`) is attributed to `project`/`both`; editing the project config to include a platform-only field (e.g. `execution.mode`) populates `sources.ignoredProjectFields` and the `ignored` row shows the platform's value, not the project's.
6. **Redaction test** — a unit test in `cli/commands/src/__tests__/cli/config-show.test.ts` with fixture config containing fake sensitive-looking keys (e.g. `adapterOptions.llm.apiKey: 'fake-test-value-1'`) asserting both table and JSON output redact the value, including on `ignored` rows. Use only non-realistic fake values to avoid tripping the repo's commit-time secret scanner.

## Tests / verification
- `pnpm --filter <cli-commands-pkg> run test:cli` — run new `config-show.test.ts` plus existing CLI handler tests.
- `pnpm --filter @kb-labs/core-runtime test` (or equivalent) — run the new `sameLocation` provenance test in `config-loader.test.ts`.
- `cd tools/kb-create/e2e && go test ./...` — run the new split-root `config show` e2e case.
- Manual: in this monorepo (sameLocation:true), run `pnpm kb config show` and `pnpm kb config show --json`, confirm all fields show `both` and no `ignored` rows appear; confirm no secrets leak in output.
- Manual (optional): install via kb-create into a scratch project, edit project `.kb/kb.config.jsonc` to add a platform-only field, run `kb config show`, confirm it appears as `ignored` with the platform's actual value shown, not the project's rejected one.