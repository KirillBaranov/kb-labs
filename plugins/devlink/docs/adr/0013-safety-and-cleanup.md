# ADR-0013: Safety & Cleanup

**Date:** 2025-10-05
**Status:** Proposed
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [tooling, process]  
**Related:** ADR-0010, ADR-0011, ADR-0012

## Context

Linking/overwriting package.json and applying plans are dangerous operations: it's easy to leave the project in a half-broken state. We need atomicity, recovery, and a unified cleanup command.

## Decision

Introduce a set of safety guarantees:

### Atomic Apply

- Any package.json edit is made through temporary file (.tmp) + fs.rename (atomic)
- Batch operations are performed in batches; on error — rollback from backup

### Backups

- Before link/unlink/plan apply, create .kb/devlink/backup/<ts>/ with copies of modified package.json and yalc.lock
- Store last N (default 5); `devlink clean` can remove them

### Rollback

- On partial failure — automatic file restoration from last backup and .tmp cleanup
- `devlink rollback [id]` command — manual rollback to any point

### Cleanup

- `devlink clean` removes: yalc.lock, local link artifacts, temp directories .kb/devlink/tmp/*, outdated backups
- `--hard` option also restores package.json to snapshot from last freeze (if available)

### CI Safety

- If no local artifacts and/or CI=true variable → default npm mode, fail-on-drift enabled
- Any command changing package.json in CI works only with --yes

## Scope

- Protection at file operation and recovery level
- Commands: rollback, clean

## Non-Goals

- Version/source policies (ADR-0012)
- Package discovery (ADR-0011)

## File Layout

```
.kb/devlink/
├── state.json          # index from ADR-0011
├── plan.json           # last calculated plan
├── lock.json           # version freeze (freeze)
├── backup/<ts>/        # backups of modified files
└── tmp/                # temporary files for atomic operations
```

## Consequences

### Positive

- ✅ Atomic operations prevent partial state corruption
- ✅ Automatic backup and recovery system
- ✅ Safe CI operations with explicit confirmation
- ✅ Complete cleanup capabilities

### Negative

| Risk | Mitigation |
|------|------------|
| .yalc/yalc.lock corruption | On error `devlink clean` + restore from backup |
| Node/TS version conflicts | DevKit build presets + warning on mismatch |
| Incomplete process | Watchdog .in-progress → on next run — auto-rollback and report |

## Implementation

### Rollout

1. Implement atomic writes and backup directory
2. Add rollback and clean
3. Run failure scenarios (simulate crash mid-batch)

### Testing

- Integration tests "crash mid-operation" → expected rollback
- Tests on clean and recovery after forced interruption
- E2E for CI: npm mode, fail-on-drift, refusal without --yes

## References

- [ADR-0010: Local Linking & Watch Pipeline](./0010-local-linkind-and-watch-pipelin.md)
- [ADR-0011: Package Discovery & Mapping](./0011-package-discovery-and-mapping.md)
- [ADR-0012: Version & Source Policy](./0012-version-and-source-policy.md)
