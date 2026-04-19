# Implementation Plan: Installer Config Placement (ADR-0013)

**ADR:** [docs/adr/0013-installer-config-placement.md](../adr/0013-installer-config-placement.md)  
**Date:** 2026-04-18

---

## Goal

Split `kb-create`'s config writing across two roots so the layered merge defined in ADR-0012 is actually exercised:

- `platformDir/.kb/kb.config.jsonc` — full platform defaults (installer owns, always updated)
- `projectDir/.kb/kb.config.jsonc` — minimal `platform.dir` pointer (user owns, never overwritten)

The runtime config loader already implements the correct merge — only the installer needs to change.

---

## Affected Files

```
tools/kb-create/
  internal/scaffold/scaffold.go   ← main changes
  cmd/create.go                   ← call WritePlatformConfig
  cmd/update.go                   ← call WritePlatformConfig on update
```

---

## Step 1 — scaffold.go: WritePlatformConfig

Add a new exported function that writes the full config to `platformDir/.kb/kb.config.jsonc`.

**Unlike `WriteProjectConfig`, this file is always overwritten** — the installer owns it.

```go
// WritePlatformConfig writes the full platform config to platformDir/.kb/kb.config.jsonc.
// This file is installer-managed and is always overwritten on install/update.
func WritePlatformConfig(platformDir string, opts Options) error {
    dir := filepath.Join(platformDir, ".kb")
    if err := os.MkdirAll(dir, 0o750); err != nil {
        return fmt.Errorf("create .kb dir: %w", err)
    }
    content := generatePlatformConfig(opts)
    path := filepath.Join(dir, "kb.config.jsonc")
    // #nosec G306 -- platform config readable in workspace.
    return os.WriteFile(path, []byte(content), 0o644)
}
```

`generatePlatformConfig(opts)` is the current `generate(opts)` function, renamed. It produces the full config with adapters, adapterOptions, services, plugins. The `platform.dir` field points to platformDir itself (self-referential, so the loader can bootstrap from either root).

---

## Step 2 — scaffold.go: WriteProjectConfig (pointer-only)

Change `WriteProjectConfig` to write only a minimal pointer config. Skip if file already exists (user may have customized it).

```go
// WriteProjectConfig writes a minimal platform.dir pointer to projectDir/.kb/kb.config.jsonc.
// Skipped if the file already exists (user-owned). Full config lives in platformDir.
func WriteProjectConfig(projectDir string, opts Options) error {
    dir := filepath.Join(projectDir, ".kb")
    if err := os.MkdirAll(dir, 0o750); err != nil {
        return fmt.Errorf("create .kb dir: %w", err)
    }

    path := filepath.Join(dir, "kb.config.jsonc")
    if _, err := os.Stat(path); err == nil {
        return nil // exists — user owns it, never overwrite
    }

    content := generatePointerConfig(opts.PlatformDir)
    // #nosec G306 -- project config readable in workspace.
    if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
        return err
    }

    // Secrets stay in projectDir.
    if gc := opts.GatewayCredentials; gc != nil {
        if err := writeEnvFile(projectDir, gc); err != nil {
            return fmt.Errorf("scaffold .env: %w", err)
        }
    }

    if err := ensureGitignore(projectDir); err != nil {
        return fmt.Errorf("scaffold gitignore: %w", err)
    }

    if opts.DemoMode {
        if err := writeDemoWorkflow(dir); err != nil {
            return fmt.Errorf("scaffold demo workflow: %w", err)
        }
    }

    if toSet(opts.Services)["workflow"] {
        if err := writeStarterWorkflows(dir); err != nil {
            return fmt.Errorf("scaffold starter workflows: %w", err)
        }
    }

    return nil
}
```

`generatePointerConfig(platformDir)` produces:

```jsonc
{
  // ─── KB Labs Project Configuration ────────────────────────────────────────
  //
  // Platform defaults live in the installation directory (see platform.dir).
  // Add overrides here — they deep-merge on top of platform defaults.
  //
  // Docs:  https://kb-labs.dev/docs/configuration
  // ADR:   https://kb-labs.dev/docs/adr/0012-platform-project-scope

  "platform": {
    // Set by kb-create — do not remove.
    "dir": "/absolute/path/to/platformDir"
  }

  // Uncomment to add overrides:
  // "services": { "studio": true },
  // "plugins": { "agents": { "enabled": true } }
}
```

---

## Step 3 — scaffold.go: Same-root guard

When `platformDir == projectDir` (single-directory install), skip `WriteProjectConfig` entirely — `WritePlatformConfig` already wrote the right file there.

This is already handled by the config loader's `samePath` branch (single file plays both roles), but the installer should not write the pointer config on top of the full config.

Add a guard in `create.go` (or surface `SameRoot bool` in `Options`):

```go
if sel.PlatformDir != sel.ProjectCWD {
    if err := scaffold.WriteProjectConfig(sel.ProjectCWD, scaffoldOpts); err != nil {
        return fmt.Errorf("scaffold project config: %w", err)
    }
}
```

---

## Step 4 — cmd/create.go: Call WritePlatformConfig

After the npm install completes and before `WriteProjectConfig`:

```go
// Write platform config (installer-owned, always overwritten).
if err := scaffold.WritePlatformConfig(sel.PlatformDir, scaffoldOpts); err != nil {
    return fmt.Errorf("scaffold platform config: %w", err)
}

// Write project pointer config (user-owned, skip if exists).
if sel.PlatformDir != sel.ProjectCWD {
    if err := scaffold.WriteProjectConfig(sel.ProjectCWD, scaffoldOpts); err != nil {
        return fmt.Errorf("scaffold project config: %w", err)
    }
}
```

---

## Step 5 — cmd/update.go: Refresh platform config on update

During `kb-create update`, re-write the platform config with current settings:

```go
if err := scaffold.WritePlatformConfig(platformDir, scaffoldOpts); err != nil {
    log.Printf("platform config update: %v (continuing)", err)
}
```

Do **not** touch projectDir config on update — user owns it.

---

## Step 6 — ensureGitignore: Add platformDir entries

`ensureGitignore` in projectDir already adds `.kb/analytics/`, `.kb/cache/`, etc. No change needed there.

In `platformDir`, the installer doesn't need to write a gitignore (platform dir is usually outside the project repo). But if `platformDir == projectDir`, the existing gitignore logic handles it correctly.

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| `platformDir == projectDir` | Only `WritePlatformConfig` runs. Loader's `samePath` branch fires — merge is a no-op. |
| First install, `platformDir ≠ projectDir` | Both files created. Layered merge active. |
| Re-install / update | `platformDir` config always refreshed. `projectDir` config skipped (file exists). |
| User deleted `projectDir` config | Next install/update re-creates pointer config. |
| User has custom `kb.config.json` (not jsonc) | Loader finds `.json` first if `.jsonc` missing. Both can coexist — jsonc takes priority when present. |

---

## Verification

```bash
# Clean install to separate platform dir
rm -rf ~/test-platform
mkdir ~/test-myproject && cd ~/test-myproject
kb-create --platform-dir ~/test-platform --yes

# Verify platform config is full
cat ~/test-platform/.kb/kb.config.jsonc  # should have adapters, adapterOptions, etc.

# Verify project config is pointer-only
cat ~/test-myproject/.kb/kb.config.jsonc  # should have only platform.dir

# Verify CLI reads merged config correctly
cd ~/test-myproject
pnpm kb config show  # should show full effective config from merge

# Verify update doesn't touch project config
echo '{"platform":{"dir":"~/test-platform"},"plugins":{"agents":{"enabled":true}}}' \
  > .kb/kb.config.json
kb-create update --yes
cat .kb/kb.config.jsonc  # user file unchanged
```

---

## What Does NOT Change

- Gateway credential writing (`.env` in projectDir) — stays as-is.
- Demo workflow + starter workflow writing — stays in projectDir.
- `ensureGitignore` logic — stays in projectDir.
- Config loader (`core/runtime/src/config-loader.ts`) — already correct, no changes.
- ADR-0012 — this ADR is a companion, not a replacement.
