# DevLink Watch Mode

**Live local linking with automatic rebuild and refresh**

Watch mode monitors your provider packages, rebuilds them when sources change, and automatically refreshes all dependent consumers — eliminating manual rebuild-refresh cycles during local development.

---

## Quick Start

```bash
# 1. Link packages first
kb devlink apply --mode local

# 2. Start watching
kb devlink watch

# 3. Edit code in any provider
# → Watch detects change
# → Rebuilds provider
# → Refreshes consumers
# → Done! ✨
```

---

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Usage](#usage)
- [Options](#options)
- [Modes](#modes)
- [Build Detection](#build-detection)
- [Consumer Refresh](#consumer-refresh)
- [Output Formats](#output-formats)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)
- [Advanced](#advanced)

---

## Overview

### Problem

Without watch mode, local development requires manual steps:

```bash
# Developer workflow (manual)
1. Edit @kb-labs/cli-core/src/utils.ts
2. cd kb-labs-cli-core && pnpm build        ← manual
3. Restart @kb-labs/cli dev server          ← manual
4. Repeat for each change                   ← tedious
```

### Solution

Watch mode automates the entire cycle:

```bash
# Developer workflow (automatic)
1. Edit @kb-labs/cli-core/src/utils.ts
2. ✨ Watch detects → builds → refreshes    ← automatic
3. Continue coding                          ← flow state
```

### Architecture

```
┌─────────────────────────────────────────────────────┐
│                                                      │
│  Provider (changed)     Build Queue    Consumers    │
│  ─────────────────      ───────────    ─────────    │
│                                                      │
│  @kb-labs/cli-core  ──▶ Build (1.4s) ──▶ Refresh   │
│    src/utils.ts         (p-queue)        cli-cmds   │
│                                          studio      │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## Installation

Watch mode is included in `@kb-labs/cli` (requires devlink-core):

```bash
# If using kb-labs CLI
pnpm install -g @kb-labs/cli

# Or in workspace
pnpm add -D @kb-labs/cli
```

**Dependencies** (automatically installed):
- `chokidar` — Cross-platform file watching
- `p-queue` — Concurrent build queue

---

## Usage

### Basic Usage

```bash
# Watch all providers and consumers
kb devlink watch
```

### With Filters

```bash
# Watch only @kb-labs/* packages
kb devlink watch --providers "@kb-labs/*"

# Watch specific consumers
kb devlink watch --consumers "@kb-labs/cli-*"

# Combine filters
kb devlink watch --providers "@kb-labs/core" --consumers "@kb-labs/cli-*"
```

### Dry Run

See what would be watched without starting:

```bash
kb devlink watch --dry-run
```

Output:
```
🔭 DevLink Watch (Dry Run)

Mode: local

📦 Providers (3)
  @kb-labs/cli-core
    Dir:     /path/to/kb-labs-cli-core
    Build:   tsc -b
    Watch:   package.json, src/**/* , tsconfig*.json, dist/**/*

  @kb-labs/shared
    Dir:     /path/to/kb-labs-shared
    Build:   pnpm run build
    Watch:   package.json, src/**/* , tsconfig*.json, dist/**/*

👥 Consumers (5)
  @kb-labs/cli-commands  ✓ script
  @kb-labs/studio        no script

🔗 Dependencies
  @kb-labs/cli-core → @kb-labs/cli-commands, @kb-labs/studio
  @kb-labs/shared → @kb-labs/cli-core
```

---

## Options

### Mode Selection

```bash
--mode <auto|local|yalc>
```

- **`auto`** (default): Detect from last-apply or lock file
- **`local`**: Use `link:` protocol (fastest, no file copies)
- **`yalc`**: Use yalc publish/update (slower, more isolated)

### Filtering

```bash
--providers <glob>     # Filter provider packages
--consumers <glob>     # Filter consumer packages
```

Glob patterns:
- `@kb-labs/*` — All @kb-labs packages
- `@kb-labs/cli-*` — All CLI packages
- `my-*-utils` — Pattern matching

### Performance Tuning

```bash
--debounce <ms>        # Debounce window (default: 200ms)
--concurrency <n>      # Max parallel builds (default: 4)
```

**Debounce**: Delay before triggering build after change. Higher = more coalescing, less frequent builds.

**Concurrency**: Max number of packages building simultaneously. Higher = faster but more CPU/memory.

### Build Control

```bash
--no-build             # Skip build, only refresh consumers
```

Use when providers are already built and you only want to trigger consumer refreshes.

### Error Handling

```bash
--exit-on-error        # Exit on first build error
```

By default, watch continues on errors. Use this flag to fail fast during CI or debugging.

### Output

```bash
--json                 # Output events as line-delimited JSON
--dry-run              # Show plan without starting watch
```

---

## Modes

### Local Mode (`link:`)

**How it works**:
- Uses `link:../path/to/package` in package.json
- No file copies, direct filesystem links
- Changes visible immediately to Node.js

**Consumer Refresh**:
```bash
# If consumer has devlink:refresh script
pnpm run devlink:refresh

# Otherwise: no-op (rely on dev watcher)
```

**Best for**:
- Active development
- Fast iteration
- TypeScript with --watch mode

### Yalc Mode

**How it works**:
- Uses yalc to "publish" providers locally
- Copies files to `.yalc/` in consumer
- More isolated than link:

**Consumer Refresh**:
```bash
# In provider
yalc publish

# In each consumer
yalc update <provider-name>
```

**Best for**:
- Testing package as end-users would consume it
- Avoiding symlink issues
- Simulating npm publish

---

## Build Detection

Watch automatically detects the best build command:

### Priority 1: Override

```json
{
  "devlink": {
    "watch": {
      "build": "tsup && cp README.md dist/"
    }
  }
}
```

Or as array:
```json
{
  "devlink": {
    "watch": {
      "build": ["tsc", "cp README.md dist/"]
    }
  }
}
```

### Priority 2: Incremental TypeScript

If `tsconfig.json` has `references`:
```bash
tsc -b  # ← Uses project references for incremental builds
```

### Priority 3: Package Script

If `package.json` has `scripts.build`:
```bash
pnpm run build
```

### Priority 4: Fallback

```bash
pnpm -C <package-dir> build
```

---

## Consumer Refresh

### Local Mode

**With `devlink:refresh` script**:
```json
{
  "scripts": {
    "devlink:refresh": "vite restart"
  }
}
```

Watch will run:
```bash
pnpm run devlink:refresh
```

**Without script**:
```
✓ refreshed (no-op, relying on dev watcher)
```

Assumes consumer has its own file watcher (e.g., `vite dev`, `nodemon`).

### Yalc Mode

Always performs:
```bash
yalc publish           # In provider
yalc update <provider> # In consumers
```

---

## Output Formats

### Human Mode (Default)

Colored, real-time feedback:

```
🔭 devlink:watch  mode=local  providers=12  consumers=37
✓ Ready, watching for changes...

• change  @kb-labs/cli-core  src/utils/index.ts
  ↳ build  @kb-labs/cli-core  tsc -b
  ↳ built  @kb-labs/cli-core  (1.4s)
  ↳ refresh  @kb-labs/cli-commands (1 consumer)
  ↳ refreshed  (0.9s)
✔ done

• change  @kb-labs/shared  src/logger.ts
  ↳ build  @kb-labs/shared  pnpm run build
  ✗ build failed  @kb-labs/shared  Type error in logger.ts
```

### JSON Mode

Line-delimited JSON for scripting:

```json
{"type":"started","mode":"local","providers":12,"consumers":37,"ts":"2025-10-19T12:00:00.000Z"}
{"type":"ready","ts":"2025-10-19T12:00:01.000Z"}
{"type":"changed","pkg":"@kb-labs/cli-core","files":["src/utils/index.ts"],"ts":"2025-10-19T12:00:05.123Z"}
{"type":"building","pkg":"@kb-labs/cli-core","command":"tsc -b","ts":"2025-10-19T12:00:05.323Z"}
{"type":"built","pkg":"@kb-labs/cli-core","duration":1400,"ts":"2025-10-19T12:00:06.723Z"}
{"type":"refreshing","pkg":"@kb-labs/cli-core","consumers":["@kb-labs/cli-commands"],"ts":"2025-10-19T12:00:06.724Z"}
{"type":"refreshed","pkg":"@kb-labs/cli-core","duration":900,"ts":"2025-10-19T12:00:07.624Z"}
```

Parse with:
```bash
kb devlink watch --json | jq -r 'select(.type=="built") | "\(.pkg): \(.duration)ms"'
```

---

## Examples

### Example 1: Basic Workflow

```bash
# Terminal 1: Start watch
cd ~/projects/kb-labs
kb devlink apply --mode local
kb devlink watch

# Terminal 2: Edit code
cd ~/projects/kb-labs-cli-core
vim src/utils.ts
# → Save
# → Watch builds and refreshes automatically
```

### Example 2: Filter by Scope

```bash
# Only watch @kb-labs/* packages
kb devlink watch --providers "@kb-labs/*"

# Watch specific provider, all consumers
kb devlink watch --providers "@kb-labs/core"
```

### Example 3: Performance Tuning

```bash
# Higher concurrency for powerful machine
kb devlink watch --concurrency 8

# Longer debounce for slower machines
kb devlink watch --debounce 500
```

### Example 4: CI/Automation

```bash
# Run watch until first error (CI check)
kb devlink watch --exit-on-error --json > watch.log

# Parse results
cat watch.log | jq -r 'select(.type=="build-error")'
```

### Example 5: Custom Build Script

```json
// In provider's package.json
{
  "name": "@kb-labs/custom-pkg",
  "devlink": {
    "watch": {
      "build": [
        "tsc",
        "cp -r assets dist/",
        "node scripts/post-build.js"
      ]
    }
  }
}
```

```bash
kb devlink watch
# → Runs all three commands on change
```

---

## Troubleshooting

### Watch Starts but Nothing Happens

**Symptom**: Watch starts, no events when editing files.

**Causes**:
1. Files outside watched paths
2. Ignored by patterns
3. Wrong working directory

**Fix**:
```bash
# Check what's being watched
kb devlink watch --dry-run

# Ensure you're in correct directory
cd /path/to/monorepo
kb devlink watch
```

### Infinite Loop (Constant Rebuilds)

**Symptom**: Build triggers immediately after completion, repeating forever.

**Cause**: Build writes to watched directory, triggers new watch event.

**Fix** (automatic):
- Watch ignores `dist/` changes within 500ms of build completion
- If still occurs, check if build writes to `src/`

**Manual fix**:
```json
// Don't write to src/ from build
{
  "devlink": {
    "watch": {
      "build": "tsc --outDir dist"  // ← Write to dist/, not src/
    }
  }
}
```

### Build Fails but Watch Continues

**Symptom**: Build error logged, watch keeps running.

**Behavior**: By design — watch continues to allow fixing errors.

**If you want to stop**:
```bash
kb devlink watch --exit-on-error
```

### High CPU Usage

**Causes**:
1. Too many packages watched
2. Concurrency too high
3. Rapid changes (no debounce)

**Fixes**:
```bash
# Reduce concurrency
kb devlink watch --concurrency 2

# Increase debounce
kb devlink watch --debounce 500

# Filter packages
kb devlink watch --providers "@kb-labs/core"
```

### Consumer Not Refreshing

**Symptom**: Provider builds, consumer doesn't update.

**Local mode**:
- Check if consumer has `devlink:refresh` script
- Check if consumer has its own dev watcher running
- Restart consumer dev server manually

**Yalc mode**:
- Check yalc installed: `npm i -g yalc`
- Check `.yalc/` exists in consumer
- Run `yalc update` manually to test

### Wrong Mode Detected

**Symptom**: Watch uses yalc but you want local (or vice versa).

**Fix**:
```bash
# Explicit mode
kb devlink watch --mode local

# Or reapply with correct mode
kb devlink apply --mode local
kb devlink watch  # Will detect local from last-apply
```

---

## Advanced

### Custom Refresh Scripts

Add `devlink:refresh` to consumers:

```json
{
  "scripts": {
    "dev": "vite",
    "devlink:refresh": "kill-port 3000 && pnpm dev &"
  }
}
```

Watch will run this after provider builds.

### Multiple Terminals

**Terminal 1**: Watch (automated rebuilds)
```bash
kb devlink watch
```

**Terminal 2**: Consumer dev server
```bash
cd packages/app
pnpm dev
```

**Terminal 3**: Edit code
```bash
vim packages/core/src/index.ts
```

### Integration with VSCode

Add to `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "DevLink Watch",
      "type": "shell",
      "command": "kb devlink watch",
      "problemMatcher": [],
      "isBackground": true,
      "presentation": {
        "reveal": "always",
        "panel": "dedicated"
      }
    }
  ]
}
```

Run: `Tasks: Run Task` → `DevLink Watch`

### Graceful Shutdown

Press `Ctrl+C`:

```
^C
Shutting down...
🔭 devlink:watch stopped
```

Watch will:
1. Stop accepting new file events
2. Wait for in-flight builds to complete
3. Close all file watchers
4. Exit cleanly

### Environment Variables

```bash
# Verbose logging
KB_DEVLINK_LOG_LEVEL=debug kb devlink watch

# Custom log format
KB_DEVLINK_LOG_LEVEL=debug kb devlink watch --json
```

---

## Best Practices

### 1. Start Watch After Linking

```bash
# ✅ Good
kb devlink apply
kb devlink watch

# ❌ Bad
kb devlink watch  # Without prior linking
```

### 2. Use Local Mode for Active Development

```bash
# ✅ Good
kb devlink apply --mode local
kb devlink watch
```

Local mode is fastest for hot reloading.

### 3. Use Yalc for Integration Testing

```bash
# ✅ Good
kb devlink apply --mode yalc
kb devlink watch
```

Yalc simulates real package installation.

### 4. Filter in Large Monorepos

```bash
# ✅ Good
kb devlink watch --providers "@my-scope/*"

# ❌ Bad (watches everything)
kb devlink watch
```

### 5. Use --dry-run First

```bash
# ✅ Good
kb devlink watch --dry-run   # Check plan
kb devlink watch              # Start watching

# ❌ Bad (surprise dependencies)
kb devlink watch
```

---

## See Also

- [ADR-0022: Watch Mode Implementation](./adr/0022-watch-mode-implementation.md)
- [DevLink README](../README.md)
- [DevLink Apply](./APPLY.md)
- [DevLink Status](./STATUS.md)

---

**Questions?** Open an issue at [kb-labs-devlink/issues](https://github.com/kirill-baranov/kb-labs-devlink/issues)

