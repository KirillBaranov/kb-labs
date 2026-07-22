# ADR-0026: Scoped Plugin Install and Adapter-Role Validation

**Date:** 2026-07-23
**Status:** Accepted (scoped install) / Proposed (adapter-role validation)
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-07-23
**Tags:** architecture, cli, plugin-system, tooling, platform

## Context

`kb-create` (the Go installer) originally had one path to install anything:
the interactive wizard (or `--yes` for its full-default preset), which always
pulls in the whole platform shape the manifest catalog defaults to. There was
no way to install a single plugin standalone — e.g. `plugins/release` in CI,
without gateway/workflow/marketplace — without going through the full
onboarding flow.

A non-interactive `kb-create install --plugins=... --services=...` command
was added to close that gap (PR #293/#294, shipped in binaries release
`v2.105.0-binaries`, verified live via a real `curl kblabs.ru/install.sh` in
CI — see `e2e/install-flow/test.sh`'s "Step 1f").

While validating it, a related gap surfaced: a plugin declares the platform
capabilities it needs via its manifest's `platform.requires`/`optional`
fields (e.g. `plugins/release/manager-cli/src/manifest.ts` declares
`requires: ['storage','cache']`), but **capability/role names live in three
places that don't talk to each other**, and nothing lets an install caller
say which real adapter package should back a role:

1. **`core/plugin-runtime/src/platform/adapter-registry.ts`** —
   `ADAPTER_REGISTRY`, a `const satisfies { [K in keyof
   Required<PluginServices>]: AdapterDescriptor<any> }`. TypeScript-enforced
   against `PluginServices`/`PlatformServices` at compile time (see
   `core/plugin-runtime/docs/adr/ADR-0001-adapter-pipeline.md`). 16 real
   keys: `logger, llm, embeddings, vectorStore, cache, storage, analytics,
   eventBus, config, invoke, documentDatabase, kvStore, logs, notifier,
   artifacts, snapshotManager`.
2. **`core/plugin-contracts/src/manifest.ts`** — `PlatformRequirements`, the
   type a plugin's own `platform.requires`/`optional` fields use. A
   **separately hand-maintained literal union** that has already drifted
   from `ADAPTER_REGISTRY`: missing `eventBus`, `config`, `invoke`,
   `documentDatabase`, `kvStore`, `logs`, `artifacts`, `snapshotManager`, and
   `optional` isn't constrained at all (`Array<string>` — any string
   passes).
3. **Go (`tools/kb-create`)** — zero representation of role names anywhere.
   `install_service.go`'s `--adapters "role=pkg@version"` flag (a different
   command, for pinning a versioned service release) parses role names as
   free text with no validation, and discards the role key after parsing —
   only the package spec reaches the install. `scaffold.go`'s generated
   `kb.config.jsonc` adapters block hardcodes packages for `llm, storage,
   logger, logRingBuffer, analytics, serviceTransport` as Go string
   literals — **`cache` isn't rendered at all**, so `release`'s `cache`
   requirement is silently unconfigured by every install today, and nobody
   has noticed.

This is exactly the "N independent hand-maintained lists that drift" failure
mode ADR-0001 already fixed once for the adapter *pipeline* internals — the
same shape of problem, one layer up, at the install/config boundary instead
of the runtime pipeline.

## Decision

### Scoped install (accepted, shipped)

`kb-create install --plugins=<ids> --services=<ids>` installs exactly what
was asked for, validates every ID against the manifest catalog
(`tools/kb-create/internal/manifest/manifest.json`) **before** any network
action, and reuses the existing non-interactive defaulting path
(`wizard.Run(Yes: true)`) rather than re-implementing it. `release` is now a
registered catalog entry (`@kb-labs/release-manager-cli`).

### Install-time flow (current + proposed)

```
kb-create install --plugins=X --services=Y [--adapters "role=pkg@ver"]
        │
        ▼
[1] Load manifest catalog (manifest.json, embedded)
        │
        ▼
[2] Validate --plugins/--services IDs against catalog        ─┐
    Validate --adapters role names against ADAPTER_REGISTRY   │  fails fast,
    _KEYS (proposed — see below)                               │  no network
        │                                                      │  yet
        ▼                                                     ─┘
[3] Install packages (pnpm add) — scoped to what was requested
        │
        ▼
[4] Scan node_modules → discover installed plugins' manifests
    (dist/manifest.json, static — no JS execution; see the
    devkit tsup preset's onSuccess hook)
        │
        ▼
[5] Read each plugin's platform.requires / platform.optional
        │
        ▼
[6] Render kb.config.jsonc adapters block:
    existing scaffold defaults ∪ --adapters overrides (proposed)
        │
        ▼
[7] Reconciliation report (proposed):
    required role, no adapter anywhere  → visible warning
    optional role, unconfigured         → informational note
```

Steps 1–5 and the "existing scaffold defaults" half of step 6 are shipped.
The `--adapters` flag, role-name validation in step 2, and the reconciliation
report in step 7 are the proposed next increment (not yet implemented).

### Proposed: one canonical role-name source, not three

Add a single derived, serializable export from the existing canonical list
instead of inventing a new one:

- `core/plugin-runtime/src/platform/adapter-registry.ts`: `export const
  ADAPTER_REGISTRY_KEYS: AdapterRegistryKey[] =
  Object.keys(ADAPTER_REGISTRY) as AdapterRegistryKey[];` — plain string
  array, no internals (governance/factory functions) exposed.
- Re-exported through `platform/index.ts` → root `src/index.ts`.
- Snapshotted to `dist/adapter-roles.json` by a small dedicated postbuild
  script (`core/plugin-runtime/scripts/emit-adapter-roles.mjs`), the same
  "static JSON so Go never executes JS" principle already used for plugin
  manifests, but simpler (plain data export, no manifest-schema detection,
  runs as its own fresh `node` process after `tsup` — no staleness concerns
  to work around).
- `tools/kb-create` reads it (`internal/devservices.LoadAdapterRoles`,
  resolved from `<platformDir>/node_modules/@kb-labs/plugin-runtime/dist/
  adapter-roles.json`) to validate `--adapters` role keys before touching
  the network, and to cross-check each installed plugin's declared
  `platform.requires`/`optional` against what's actually configured.

### What this does *not* fix (two distinct kinds of "source of truth")

Role **names** (is `"cache"` a real capability?) and role **default
packages** (which npm package backs `cache` when nothing overrides it) are
different questions. `ADAPTER_REGISTRY` can answer the first at compile time
— capability existence is a type-level fact. It cannot answer the second —
which package to recommend by default is an editorial/product choice, not
something a type system enforces. That mapping stays exactly where it is
today: hardcoded Go string literals in `scaffold.go`'s config-rendering
template. A further improvement — moving those defaults into
`tools/kb-create/internal/manifest/manifest.json`'s already-existing (but
underused) `AdapterConfig` struct, so defaults become config-editable
without a Go binary release — is worth doing but is a separate change, not
bundled into this one.

## Install Flow Map and Invariants

Three entity kinds, ranked by who can ship them and what they can own:

```
service   ⊃ plugin capabilities, OWNS a daemon + port         — KB Labs only
plugin    — CLI commands + optional REST routes (mounted      — anyone
            via the shared gateway, never its own daemon)
adapter   — implements one role (llm/cache/storage/...);      — anyone
            the ROLE is a KB-Labs-controlled contract
            (ADAPTER_REGISTRY), the PACKAGE behind it is not
```

A service can do everything a plugin can (release's manifest proves a
*plugin* can already have `rest.routes` without being a service — the
distinguishing fact is daemon+port ownership, not HTTP presence). A plugin
can never become a service. An adapter is orthogonal to both — plugins and
services *consume* adapters by role name, they don't contain them.

This asymmetry is why services get away with a small hardcoded catalog
entry (`manifest.json`'s 5 `@kb-labs/*` services — closed, trusted set)
while plugins needed a self-describing static manifest (`dist/manifest.json`,
this ADR's shipped half) — the set of plugin publishers is open, so it can't
be hardcoded the way services can.

### Top-down call chain for `kb-create install --plugins=X --services=Y --adapters="role=pkg"`

```
[0] cmd/install.go: runInstall
      │
      ▼
[1] manifest.Load()  ──────────────────────────────────────────  catalog
      reads embedded/dev-override manifest.json                  (services+
      │                                                          plugins IDs,
      ▼                                                          KB-Labs only)
[2] validateComponentIDs(plugins, services)   ── FAILS HARD, ZERO SIDE EFFECTS
      unknown ID → error + list of valid IDs, before any network/fs action
      (adapters: role validated against ADAPTER_REGISTRY_KEYS — proposed —
       NOT against manifest.json; package spec itself is never validated
       here, only pnpm resolving it later can tell you it doesn't exist)
      │
      ▼
[3] wizard.Run(Yes: true) → defaultSelection()  ── single defaulting source
      PlatformDir / Consent / Telemetry come from here — shared with the
      interactive `--yes` path, not reimplemented. sel.Services/sel.Plugins
      then OVERWRITTEN with exactly what was requested (not merged with
      catalog defaults).
      │
      ▼
[4] pm.Install(specs) — pnpm add
      specs = CorePackageSpecs() ∪ AdapterPackageSpecs() (5 baseline        ⚠ NOT
              adapters: fs/pino/log-ringbuffer/analytics-file/              scoped —
              service-transport-http — ALWAYS installed)                   see I3
            ∪ selectedPkgSpecs(requested plugins/services only)
      A selected plugin's OWN package.json deps (e.g. release →
      core-state-daemon) ride along transitively — not filtered.           see I4
      FAILURE: pnpm error → hard fail, install aborts.
      │
      ▼
[5] scan.Run() — Node subprocess walks the WHOLE node_modules tree
      classifies anything with a kb.manifest by schema prefix into
      Plugins / Services / Adapters — including transitively-installed
      things nobody explicitly asked for (state-daemon showed up this way
      in the release e2e test — expected, not a bug: release declares
      `cache`, core-state-daemon is what backs it).                        see I4
      FAILURE: soft — warns, sets a user-visible ServicesWarning, does
      NOT block the rest of install.
      │
      ▼
[6] devservices.LoadPluginManifest() per discovered plugin — Go-native,
      no JS execution. Reads Platform.Requires/Optional, Permissions.Env
      .Read, ConfigSection from each plugin's static dist/manifest.json.
      FAILURE: soft, per-plugin — missing/invalid file is silently
      skipped (e.g. an older published version predating this convention).
      │
      ▼
[7] scaffold.generateFull() → kb.config.jsonc
      services/plugins TOGGLE blocks: scoped to selection, BUT gated by a
      SEPARATE hardcoded Go list (writeToggle/writePluginBlock) that must
      be manually kept in sync with manifest.json's catalog — today it
      ISN'T fully in sync: `gateway` and `marketplace`-as-service have no
      toggle at all, `marketplace`-as-plugin has no block either.          ⚠ see I5
      adapters block: NOT scoped — always fully rendered (llm/storage/
      logger/logRingBuffer/analytics/serviceTransport get some default;
      `cache` renders nothing at all today — proposed to fix).
      │
      ▼
[8] Reconciliation report (proposed) — cross-check each discovered
      plugin's Platform.Requires/Optional against the FINAL resolved
      adapter set (defaults ∪ --adapters overrides).
      required + unconfigured → visible warning (not a hard fail yet)
      optional + unconfigured → informational note
```

### Invariants

| # | Statement | Enforced where | On violation |
|---|-----------|----------------|---------------|
| I1 | Requested plugin/service IDs must exist in the manifest catalog | `validateComponentIDs`, step 2 | **Hard fail**, before any network/fs action, lists valid IDs |
| I2 | Non-interactive defaulting (platform dir, consent, telemetry) has exactly one implementation | `wizard.Run(Yes:true)`, step 3 | N/A — shared code path, can't drift between interactive/CI installs |
| I3 | Core packages + the 5 baseline adapters install unconditionally, regardless of `--plugins`/`--services` selection | `CorePackageSpecs()`/`AdapterPackageSpecs()`, step 4 | Not a failure — a deliberate scoping boundary: "scoped install" scopes *plugins/services*, not the platform baseline |
| I4 | A selected plugin's transitive npm dependencies are discovered by the scanner even though they weren't explicitly requested | `scan.Run()`, step 5 | Not a failure — expected when a plugin genuinely depends on a service (e.g. release → core-state-daemon for its `cache` requirement) |
| I5 | A plugin/service in the manifest catalog is *installable* but not automatically *configurable/visible* in generated config — that needs a matching, separately-maintained entry in `scaffold.go`'s Go template | `writeToggle`/`writePluginBlock`, step 7 | **Known gap, not yet enforced anywhere** — `gateway`, `marketplace` (as service and as plugin) are catalog-installable today with no rendered config block at all |
| I6 | Adapter *role names* are validated against a KB-Labs-controlled canonical list; adapter *package specs* are not validated until pnpm resolves them | proposed `ADAPTER_REGISTRY_KEYS` check, step 2 | Unknown role → hard fail early (proposed); bad package spec → pnpm failure later, same as any other package |
| I7 | Static-JSON reads (plugin manifests, proposed adapter-roles list) are always best-effort | steps 6, 8 | Missing/invalid file never blocks install — only reduces how much the reconciliation report can say |

I5 is the same "N hand-maintained lists that drift" shape as the adapter-role
problem this ADR already targets, one layer further down (catalog ↔
config-template instead of role-name ↔ role-name). Not fixed by the proposal
above — worth its own follow-up (e.g. drive `writeToggle`/`writePluginBlock`
generically off the catalog's `Component` list instead of a parallel
hardcoded Go call per entry), tracked here so it isn't lost.

## Consequences

### Positive

- One canonical, compile-time-enforced list of valid capability/role names,
  reachable from Go without executing JS — same static-JSON pattern already
  proven for plugin manifests.
- `--adapters` role typos fail fast, before any package is installed,
  instead of silently producing a config with an unrecognized key.
- The previously-silent `cache`-unconfigured-for-`release` gap becomes a
  visible warning instead of invisible NoOp behavior nobody notices.
- Small, additive changes on both sides — no existing behavior changes when
  `--adapters` isn't passed.

### Negative

- Introduces a new build artifact (`adapter-roles.json`) and a new Go
  dependency on a specific file path inside a *transitively* installed
  package (`@kb-labs/plugin-runtime` isn't in the manifest's always-installed
  `core` list) — resolution needs to degrade gracefully (skip validation,
  warn softly) if the file isn't found, rather than hard-fail.
- Does not fix the `PlatformRequirements` drift from `ADAPTER_REGISTRY` on
  the TypeScript authoring side (a plugin author can still declare a bogus
  capability name in their own manifest today) — deferred, see below.
- Does not change role-name *default packages* to be config-driven — still
  Go string literals, a second, smaller "source of truth" gap left open.

### Alternatives Considered

- **Reuse the devkit tsup preset's `emitManifestJson` hook** for the
  adapter-roles snapshot too. Rejected: that hook is specifically keyed off
  `kb.plugin/*`/`kb.service/*` manifest schema detection; overloading it for
  an unrelated arbitrary-export snapshot would complicate its one job. A
  small dedicated postbuild script in `core/plugin-runtime` is simpler and
  fully sufficient — this isn't a manifest, so it doesn't need manifest
  detection logic.
- **Hard-fail installs on an unsatisfied required role.** Rejected for this
  increment: every install today already leaves `cache` unconfigured for
  `release` with no one having noticed — hard-failing immediately would be a
  breaking change to roll out separately, after the reconciliation report has
  been observed in practice.
- **Expose the whole `ADAPTER_REGISTRY` object to Go/JSON.** Rejected: its
  values are governance/factory functions, not serializable, and exposing
  them on the public package surface would leak internals never meant to be
  consumed outside `plugin-runtime`. A derived `ADAPTER_REGISTRY_KEYS`
  (names only) is the minimal correct surface.

## Implementation

Shipped:
- `tools/kb-create/cmd/install.go`, `internal/installer/installer.go`
  (`Result.InstalledPlugins`), `internal/devservices/plugin_manifest.go`,
  `internal/manifest/manifest.json` (`release` catalog entry),
  `infra/devkit/tsup/node.js` (`emitManifestJson` extended to `kb.plugin/*`
  schemas).

Proposed, not yet implemented:
- `core/plugin-runtime/src/platform/adapter-registry.ts` — add
  `ADAPTER_REGISTRY_KEYS` export.
- `core/plugin-runtime/src/platform/index.ts`, `src/index.ts` — re-export it.
- `core/plugin-runtime/scripts/emit-adapter-roles.mjs` — new postbuild script.
- `core/plugin-runtime/package.json` — extend `build` script.
- `tools/kb-create/internal/devservices/adapter_roles.go` — new
  `LoadAdapterRoles` reader.
- `tools/kb-create/cmd/install.go` — new `--adapters` flag (reusing
  `install_service.go`'s existing `parseAdapters`), role validation,
  reconciliation report.
- `tools/kb-create/internal/scaffold/scaffold.go` — new `Options.Adapters`
  field, honor overrides, add `cache` as a renderable (opt-in, no built-in
  default) role.

### Explicitly deferred (next step, not this ADR)

- Fixing `core/plugin-contracts/src/manifest.ts`'s `PlatformRequirements` to
  derive from `AdapterRegistryKey` directly, so a plugin author cannot
  declare a bogus capability at manifest-authoring time — this is
  manifest-authoring-time validation, a different point in the lifecycle
  than install-time validation.
- Validating adapter roles when installing a plugin onto an
  already-running platform via the marketplace (`plugins/marketplace`) — a
  different install mechanism entirely, not `kb-create install`.
- Moving role → default-package mappings out of `scaffold.go`'s Go literals
  into `manifest.json`'s `AdapterConfig`.

## References

- [PR #293 — kb-create static plugin manifest JSON + non-interactive install](https://github.com/kb-labs-team/kb-labs/pull/293)
- [PR #294 — changelog + real e2e test for kb-create install --plugins](https://github.com/kb-labs-team/kb-labs/pull/294)
- [ADR-0001 — Slot-Based Adapter Middleware Pipeline](../../core/plugin-runtime/docs/adr/ADR-0001-adapter-pipeline.md) (the original "single source of truth" fix this ADR extends to the install boundary)

---

**Last Updated:** 2026-07-23
