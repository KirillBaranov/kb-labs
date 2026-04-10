# ADR-0014: Preflight Checks and Backup System

**Date:** 2025-10-11
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [tooling, process]

## Context

Before mutating `package.json` and lockfiles, DevLink needed a safety layer to prevent accidental data loss or corruption, especially in repositories with uncommitted changes. Without such safeguards:

- Users could accidentally overwrite uncommitted changes
- Failed operations could leave the repository in an inconsistent state
- No backup mechanism existed for recovery
- CI/CD pipelines had no way to bypass interactive confirmations

## Decision

Implement a unified preflight system integrated into all mutating operations (`apply`, `applyLockFile`, `undo`) with the following components:

### 1. Git Dirty Detection (`utils/git.ts`)

- Check for uncommitted changes via `git status --porcelain`
- Focus on `package.json` and lockfiles (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`)
- Gracefully handle non-git repositories and git command failures
- Never block operations due to git unavailability

### 2. Backup System (`utils/backup.ts`)

- Automatically backup affected files before mutation
- Store backups in `.kb/devlink/backups/<ISO-timestamp>/<relative-path>`
- Preserve JSON formatting for `package.json` files
- Support batch backups for multiple files with shared timestamp

### 3. Preflight Framework (`utils/preflight.ts`)

- Unified entry point for all safety checks
- Warn users about uncommitted changes
- Block operations unless `--yes` flag is provided
- Skip all checks in `--dry-run` mode
- Return structured results with warnings and proceed flag

### 4. API Integration

All mutating API functions now support:

```typescript
{
  dryRun?: boolean;  // Skip execution and preflight
  yes?: boolean;     // Skip confirmation prompts
}
```

**Flow:**
1. Check git status (unless `dryRun`)
2. If dirty and no `--yes`: warn and block
3. If dirty with `--yes`: warn and proceed
4. Create backups before mutation
5. Execute operation
6. Save state/journal

## Consequences

### Positive

- **Safety by default**: No accidental overwrites without explicit consent
- **Recoverability**: Automatic backups enable manual recovery
- **CI/CD friendly**: `--yes` flag enables automation scenarios
- **Graceful degradation**: Works even when git is unavailable
- **Consistent UX**: All mutating operations behave identically

### Negative

- **Slight performance overhead**: Git check + backup I/O adds ~50-200ms per operation
- **Disk usage**: Backups accumulate in `.kb/devlink/backups/` (manual cleanup required)
- **Breaking change for automation**: Existing scripts without `--yes` will be blocked if git is dirty

### Neutral

- CLI gains new `--yes` flag for all mutating commands
- Warning messages guide users toward safer workflows
- Dry-run behavior unchanged (skips all safety checks)

## Alternatives Considered

### Manual confirmation prompts in CLI

**Rejected**: Duplicates UI logic across CLI and core. Preflight checks belong in the core package to ensure consistent behavior regardless of how the API is consumed (CLI, programmatic, IDE extension, etc.).

### Git hooks (pre-commit, pre-push)

**Rejected**: Not cross-platform, requires user setup, can be bypassed. DevLink needs built-in safety that works out-of-the-box.

### External backup tooling

**Rejected**: Adds complexity and external dependencies. Users would need to configure and maintain separate backup systems. Integrated backups are simpler and more reliable.

### Always backup without git check

**Rejected**: Creates unnecessary backups on every operation, wasting disk space. Git dirty check provides intelligent triggering.

## Implementation

### Files Created

- `packages/core/src/utils/git.ts` — Git status detection
- `packages/core/src/utils/backup.ts` — Backup creation utilities
- `packages/core/src/utils/preflight.ts` — Unified preflight framework
- `packages/core/src/__tests__/preflight.spec.ts` — Comprehensive test suite (16 tests)

### Files Modified

- `packages/core/src/api/apply.ts` — Integrated preflight + backups
- `packages/core/src/api/apply-lock.ts` — Integrated preflight + backups
- `packages/core/src/api/undo.ts` — Integrated preflight + backups
- `packages/core/src/utils/index.ts` — Export new utilities

### Testing

All functionality covered by 16 new tests:
- Git dirty detection (clean/dirty/error scenarios)
- Backup creation and verification
- Preflight checks with/without `--yes`
- API integration (apply, applyLockFile, undo)
- Dry-run bypass verification

### Example Output

```bash
⚠️  Uncommitted changes detected in: packages/a/package.json (and 5 more)
   Devlink will modify package.json files. Consider committing your changes first.
   Use --yes to skip this warning and proceed anyway.
```

## Future Considerations

### Automatic Cleanup

Consider adding `devlink clean --backups --older-than=7d` to automatically remove old backups.

### Backup Restore Command

Add `devlink restore <timestamp>` to restore from a specific backup instead of manual file copying.

### Configurable Patterns

Allow `.devlink.config.json` to customize which files trigger git warnings:

```json
{
  "preflight": {
    "patterns": ["**/package.json", "**/*.lock", "**/tsconfig.json"]
  }
}
```

## References

- Implementation: `packages/core/src/utils/{git,backup,preflight}.ts`
- Tests: `packages/core/src/__tests__/preflight.spec.ts`
- API Integration: `packages/core/src/api/{apply,apply-lock,undo}.ts`
- Related: [ADR-0009: Core Architecture](./0009-core-architecture.md)

