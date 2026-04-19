# ADR-0013: Installer Config Placement (Companion to ADR-0012)

**Status:** Accepted  
**Date:** 2026-04-18  
**References:** [ADR-0012 — Platform / Project Scope](./0012-platform-project-scope.md)

---

## Context

ADR-0012 defines the layered config architecture: `platformDir` holds installer-managed defaults; `projectDir` holds user overrides. The runtime config loader (`core/runtime/src/config-loader.ts`) already implements the correct merge:

```
platformDir/.kb/kb.config.jsonc  →  base (adapters, adapterOptions, execution)
projectDir/.kb/kb.config.jsonc   →  user overrides (services, plugins, extensions)
                ↓ policy-aware merge (mergeWithFieldPolicy)
                effective config
```

However, `kb-create` currently writes the **full** config only to `projectDir/.kb/kb.config.jsonc` and nothing to `platformDir/.kb/`. This means:

- When `platformDir ≠ projectDir` (standard install or dogfooding), the installed config pollutes the project workspace and conflicts with the developer's own `kb.config.json`.
- Re-install or update overwrites user configs (partially mitigated by the "skip if exists" guard, but that guard prevents the installer from ever updating platform defaults).
- The layered merge defined in ADR-0012 is never exercised because both layers resolve to the same file.

## Decision

Split config writing across the two roots, matching their ownership:

### platformDir/.kb/kb.config.jsonc — installer-owned

The installer writes the **full platform config** here:

- `platform.adapters` — which adapter packages are active
- `platform.adapterOptions` — per-adapter settings (storage baseDir, logger level, etc.)
- `platform.execution` — worker-pool vs in-process
- `platform.dir` — self-referential path (so the loader can find it when only platformDir is known)

This file is **always overwritten on install/update** (installer owns it). Users should not edit it — any overrides belong in `projectDir`.

### projectDir/.kb/kb.config.jsonc — user-owned

The installer writes a **minimal pointer** here on first install only (skip if file exists):

```jsonc
{
  // ─── KB Labs Project Configuration ─────────────────────────────────────
  // Platform defaults live in the platform installation directory.
  // Add overrides here — they deep-merge on top of platform defaults.
  // Docs: https://kb-labs.dev/docs/configuration

  "platform": {
    // Path to the platform installation. Set by kb-create, do not remove.
    "dir": "/absolute/path/to/platformDir"
  }

  // Uncomment to override platform defaults:
  // "services": { "studio": true },
  // "plugins": { "agents": { "enabled": true, "maxSteps": 50 } }
}
```

The user can freely add `services`, `plugins`, or any mergeable field (per ADR-0012 field policy). Platform-only fields (`adapters`, `adapterOptions`, `execution`) are silently ignored if the user adds them here — the config loader enforces this via `CONFIG_FIELD_SCOPE`.

### Secrets (.env) — always in projectDir

Gateway credentials and other secrets written by the installer stay in `projectDir/.env` (gitignored). They are project-scoped, not platform-scoped.

### Workflows — always in projectDir

Demo and starter workflows are written to `projectDir/.kb/workflows/`. These are user-editable assets, not platform defaults.

## Consequences

### Positive

- `kb-create update` can safely update `platformDir/.kb/kb.config.jsonc` without touching user configs.
- Dogfooding scenario works: developer's `kb.config.json` in projectDir coexists with installer's jsonc in platformDir with no conflicts.
- `kb.config.jsonc` in projectDir is now truly minimal and stable — users rarely need to touch it.
- ADR-0012's layered merge is actually exercised for the first time.

### Breaking

- Existing installs have the full config in `projectDir/.kb/kb.config.jsonc`. The "skip if exists" guard keeps them working, but they won't benefit from the split until they delete the file and re-run `kb-create update`.
- `platformDir/.kb/kb.config.jsonc` is a new file — installs on older platform roots will not have it until `kb-create update` runs.

### Neutral

- When `platformDir == projectDir` (same directory install), the loader's `samePath` branch fires — both layers resolve to the same file and the merge is a no-op. This case is unaffected by this ADR.

## Implementation

**Files to change** (all in `tools/kb-create/`):

| File | Change |
|------|--------|
| `internal/scaffold/scaffold.go` | Add `WritePlatformConfig(platformDir, opts)` (full config, always overwrite). Change `WriteProjectConfig` to write pointer-only, skip if exists. |
| `cmd/create.go` | Call `WritePlatformConfig` after install. Keep `WriteProjectConfig` call unchanged. |
| `cmd/update.go` | On update, call `WritePlatformConfig` to refresh platform defaults. |

See implementation plan in `docs/plans/0013-installer-config-placement.md`.
