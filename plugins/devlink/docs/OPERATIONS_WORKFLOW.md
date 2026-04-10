# DevLink Operations Workflow

## Overview

DevLink manages workspace dependencies through two core operations: **freeze** and **apply**. Each operation has a specific purpose and creates backups for safe undo.

## Core Concepts

### Lock File (`.kb/devlink/lock.json`)
Central source of truth for dependency versions and sources. Tracks per-consumer dependencies with:
- Version specifications
- Source types (workspace/link/npm/github)
- Checksums and metadata

### State Flow

```
package.json files ──freeze──> lock.json ──apply──> package.json files
     (source)                 (snapshot)            (modified)
```

## Operations

### 1. Freeze (Manifests → Lock)

**Purpose:** Create/update lock file from current package.json files

**What it does:**
1. Scans all package.json files in workspace
2. Resolves versions from pnpm-lock.yaml
3. Creates/updates `.kb/devlink/lock.json`
4. Backs up old lock.json (if exists)

**When to use:**
- After adding new dependencies
- Before switching modes
- To create a reproducible snapshot

**Commands:**
```bash
# Create lock with caret pinning (default)
kb devlink freeze --pin=caret

# Replace existing lock completely
kb devlink freeze --replace

# Remove entries not in current manifests
kb devlink freeze --prune

# Preview changes
kb devlink freeze --dry-run
```

**What gets backed up:**
```
.kb/devlink/backups/2025-10-19T14-39-33.311Z/
  backup.json          # Metadata
  type.freeze/
    lock.json          # OLD lock.json (before overwrite)
```

**Undo:**
- Restores old lock.json from backup
- package.json files unchanged (they weren't modified)

### 2. Apply (Lock → Manifests)

**Purpose:** Modify package.json files according to lock file

**What it does:**
1. Reads `.kb/devlink/lock.json`
2. Modifies package.json dependencies
3. Changes version protocols (e.g., `workspace:*` → `link:../path`)
4. Backs up old package.json files

**When to use:**
- Switch to local development (`--mode=local`)
- Apply locked versions to manifests
- Synchronize workspace with lock

**Commands:**
```bash
# Apply with local links
kb devlink apply --mode=local

# Apply with workspace protocol
kb devlink apply --mode=workspace

# Preview changes
kb devlink apply --dry-run

# Skip confirmation
kb devlink apply --yes
```

**What gets backed up:**
```
.kb/devlink/backups/2025-10-19T14-37-35.449Z/
  backup.json          # Metadata
  type.apply/
    manifests/         # OLD package.json files (before changes)
      kb-labs-cli/packages/commands/package.json
      kb-labs-cli/packages/core/package.json
      ...
```

**Undo:**
- Restores old package.json files from backup
- lock.json unchanged (it wasn't modified)

## Typical Workflows

### Workflow 1: Start Local Development

```bash
# 1. Freeze current state (create snapshot)
kb devlink freeze --pin=caret

# 2. Apply with local links (switch to development mode)
kb devlink apply --mode=local

# 3. Work on code (edits propagate via link:)

# 4. When done, undo back to workspace protocol
kb devlink undo
```

### Workflow 2: Update Dependencies

```bash
# 1. Update package.json manually (add/remove deps)

# 2. Freeze to capture new dependencies
kb devlink freeze

# 3. Apply to sync all consumers
kb devlink apply

# 4. Install
pnpm install
```

### Workflow 3: Sync to Lock

```bash
# Someone changed lock.json, need to sync manifests

# 1. Apply lock to manifests
kb devlink apply-lock --yes

# 2. Install
pnpm install
```

## Backup System

### Backup Structure

Every operation creates a timestamped backup with complete metadata:

```
.kb/devlink/backups/
  2025-10-19T14-39-33.311Z/       # ISO timestamp
    backup.json                   # Rich metadata
    type.freeze/                  # For freeze operations
      lock.json                   # Old lock
    type.apply/                   # For apply operations
      manifests/                  # Old package.json files
        kb-labs-cli/package.json
        ...
```

### backup.json Metadata

Contains complete operation context:
- **Type:** freeze or apply
- **Timestamp:** ISO format
- **Mode & Policy:** at time of operation
- **Counts:** manifests, deps, consumers
- **Checksums:** SHA256 for all files
- **Git info:** commit, branch, dirty status
- **Platform:** os, arch, node version
- **Protected:** flag to prevent auto-deletion

### Retention Policy

Backups are automatically cleaned up based on:
- **keepCount:** 20 (keep 20 most recent)
- **keepDays:** 14 (keep backups younger than 14 days)
- **minAge:** 1h (never delete backups younger than 1 hour)
- **Protected:** never auto-delete if marked as protected

**Policy:** Keep backup if ANY condition is true

## Managing Backups

### List Backups

```bash
# List all
kb devlink backups

# Filter by type
kb devlink backups --type freeze

# Limit output
kb devlink backups --limit 10

# JSON format
kb devlink backups --json
```

Output:
```
📦 DevLink Backups (2 total)

  2025-10-19T14-39-33.311Z  •  5m ago  •  freeze  •  331 deps ✓ lock
  2025-10-19T14-37-35.449Z  •  2m ago  •  apply   •  24 manifests

💡 Use: kb devlink undo --backup <timestamp>
💡 Cleanup: kb devlink backups --prune
```

### Protect Important Backups

```bash
# Mark as protected (won't auto-delete)
kb devlink backups --protect 2025-10-19T14-39-33.311Z

# Remove protection
kb devlink backups --unprotect 2025-10-19T14-39-33.311Z
```

### Manual Cleanup

```bash
# Preview cleanup
kb devlink backups --prune --dry-run

# Cleanup old backups
kb devlink backups --prune

# Custom retention
kb devlink backups --prune --keep 10 --keep-days 7
```

## Undo Operations

### Undo Last Operation

```bash
# Preview undo
kb devlink undo --dry-run

# Undo last operation
kb devlink undo
```

**Behavior:**
- Finds most recent operation (apply or freeze)
- Restores from corresponding backup
- Marks journal as "undone"

### What Gets Restored

| Last Operation | What Undo Restores | What Stays |
|----------------|-------------------|------------|
| **freeze** | lock.json | package.json files |
| **apply** | package.json files | lock.json |

## Safety Features

### Advisory Locks

Prevent concurrent operations:
```
.kb/devlink/.lock    # Created during freeze/apply
                     # Auto-removed after completion
                     # Stale timeout: 5 minutes
```

### Atomic Writes

All critical files written via tmp+rename:
```
lock.json.tmp → lock.json      # Atomic
backup.json.tmp → backup.json  # Atomic
```

### Git Integration

Backup metadata includes git context:
```json
{
  "git": {
    "commit": "abc1234",
    "branch": "main",
    "dirty": false
  }
}
```

## Checking Status

```bash
# Full status
kb devlink status

# Shows:
# - Current mode
# - Last operation with age
# - Undo availability with backup timestamp
# - Lock statistics
# - Manifest differences
# - Health warnings
# - Suggested actions
```

Example:
```
🧭 Context
  Mode:           local via plan
  Last operation: freeze  •  5m ago
  Undo available: yes    →  kb devlink undo
  Backup:         2025-10-19T14-39-33Z

🔒 Lock
  Consumers: 33   Deps: 331   Sources: workspace 34 • npm 297
```

## Best Practices

### 1. Always Check Status First
```bash
kb devlink status
```

### 2. Use Dry-Run for Safety
```bash
kb devlink freeze --dry-run      # Preview changes
kb devlink apply --dry-run       # Preview changes
kb devlink undo --dry-run        # Preview undo
```

### 3. Protect Important Snapshots
```bash
# Before release
kb devlink freeze --pin=exact
kb devlink backups --protect $(kb devlink backups --limit 1 --json | jq -r '.backups[0].timestamp')
```

### 4. Regular Cleanup
```bash
# Check what would be removed
kb devlink backups --prune --dry-run

# Cleanup
kb devlink backups --prune
```

## Troubleshooting

### "LOCK_HELD" Error

Another operation is in progress:
```bash
# Wait for it to complete, or if stale (>5min):
rm .kb/devlink/.lock
```

### "BACKUP_NOT_FOUND"

Backup missing or corrupted:
```bash
# List available backups
kb devlink backups

# Validate backups
kb devlink backups --validate --all
```

### Manifest Differs from Lock

Status shows LOCK_MISMATCH warning:
```bash
# Option 1: Sync manifests to lock
kb devlink apply-lock --yes

# Option 2: Update lock from manifests
kb devlink freeze
```

## Technical Details

### Timestamp Format

- **New:** ISO 8601 (filesystem-safe): `YYYY-MM-DDTHH-mm-ss.SSSZ`
- **Old:** Legacy format: `YYYY-MM-DD__HH-mm-ss-MSSZ`
- **Backward compatible:** Both formats supported

### Performance

- Freeze operation: ~200-300ms
- Apply operation: ~150-200ms
- List backups: <5ms
- Status check: ~8-10ms

### Cross-Platform

- POSIX paths in metadata (cross-platform)
- Platform-specific paths in actual files
- Windows-safe rename operations
- Works on macOS/Linux/Windows

## REST API: DevLink Plan DTO

DevLink exposes the most recent plan via the plugin REST API so that downstream tools (Studio, dashboards, automation) can consume a normalized graph without shelling out.

```
GET /api/v1/plugins/devlink/plan
```

- **Source file:** `.kb/devlink/last-plan.json`
- **Caching:** responses are cached in-memory by SHA1 hash; the hash is returned in `meta.hash`
- **Query parameters:**
  - `cwd` *(optional)* — workspace root override. Without it the handler resolves the umbrella root via `KB_LABS_WORKSPACE_ROOT` / `KB_LABS_REPO_ROOT` or the nearest `.kb/kb-labs.config.json`, falling back to the request workdir.
- **Success response:**

```json
{
  "nodes": [
    {
      "id": "package-a",
      "workspace": true,
      "actionCounts": { "total": 1, "byKind": { "link-local": 1 } },
      "dependencyCounts": { "incoming": 0, "outgoing": 1, "incomingByType": { "dep": 0, "dev": 0, "peer": 0 }, "outgoingByType": { "dep": 1, "dev": 0, "peer": 0 } }
    }
  ],
  "edges": [
    {
      "id": "package-a->package-b",
      "from": "package-a",
      "to": "package-b",
      "type": "dep",
      "action": {
        "kind": "link-local",
        "reason": "mode=local"
      }
    }
  ],
  "cycles": [],
  "summary": {
    "rootDir": "/workspace/repo",
    "mode": "local",
    "packageCount": 3,
    "actionCount": 2,
    "actionsByKind": { "link-local": 1, "use-npm": 1 },
    "cycleCount": 0,
    "diagnosticsCount": 0
  },
  "diagnostics": [],
  "meta": {
    "sourcePath": "/workspace/repo/.kb/devlink/last-plan.json",
    "hash": "c0ffee...",
    "lastModified": "2025-11-08T14:13:52.000Z",
    "generatedAt": "2025-11-08T14:13:52.783Z"
  },
  "widgets": {
    "overview": {
      "infoPanel": { "sections": [/* … */] },
      "actionsChart": [
        {
          "name": "Actions",
          "points": [
            { "x": "link-local", "y": 1 },
            { "x": "use-npm", "y": 1 }
          ]
        }
      ],
      "diagnostics": { "cards": [/* … */] }
    },
    "dependencies": {
      "repoTree": { "id": "repo:Workspace", "label": "Workspace", "children": [/* … */] },
      "packagesTable": [
        {
          "package": "package-a",
          "repo": "workspace",
          "version": "1.0.0",
          "scope": "workspace",
          "actions": 1,
          "actionKinds": "link-local ×1",
          "outgoingDeps": 1,
          "incomingDeps": 0
        }
      ]
    }
  }
}
```

- **Error response:** `{ "ok": false, "code": "DEVLINK_PLAN_*", "message": "..." }`
- **Contracts:** Zod schemas (`PlanRequestSchema`, `DevLinkPlanSchema`) are published with the plugin bundle for consumers that need static validation.

- **Widget slices:** Studio widgets request filtered payloads by appending a `view` query parameter:
  - `view=overview` → overview info panel sections
  - `view=overview.actions` → action chart series
  - `view=overview.diagnostics` → diagnostics cards
  - `view=dependencies.tree` → repository/package tree
  - `view=dependencies.table` → package table rows

Studio renders everything declaratively via four widgets (`overview`, `actions`, `dependencies`, `packages`), each pointing to the REST slice above—no bespoke frontend logic required.

