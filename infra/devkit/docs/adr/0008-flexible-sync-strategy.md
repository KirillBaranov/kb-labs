# ADR-0008: Flexible Sync and Drift Management in DevKit

**Date:** 2025-01-28
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [tooling, process]

## Context

The DevKit sync tool manages shared assets (CI workflows, configs, agents, etc.) across the KB Labs ecosystem. The initial implementation treated entire directories (e.g., `.github/workflows`) as a single sync target. This caused false-positive drift reports when consumer repositories had additional project-specific files (e.g., `sentinel-review.yml`) that were not provided by DevKit.

We need a scalable, transparent, and CTO-grade strategy that:
- Clearly separates what DevKit owns from what projects own
- Prevents false drift detection for unmanaged files
- Keeps sync fast, predictable, and auditable
- Provides knobs for teams to override, disable, or extend sync behavior

## Decision

We will introduce a **Managed-Only Drift Strategy** that provides transparent ownership tracking and flexible drift detection modes.

### Core Components

#### 1. Provenance Files

After each operation, DevKit writes provenance files in the `.kb/devkit/tmp/` directory:

- **`DEVKIT_SYNC.json`** - Created after sync operations, tracks what was synced
- **`DEVKIT_CHECK.json`** - Created after check operations, tracks drift analysis results

Both files contain:
- DevKit version and timestamp
- An items list of all targets processed
- The drift detection scope used
- Detailed operation report (for check operations)

**Sync file example:**
```json
{
  "source": "@kb-labs/devkit",
  "version": "1.2.3",
  "when": "2025-01-28T12:00:00Z",
  "scope": "managed-only",
  "items": ["ci", "agents", "cursorrules"]
}
```

**Check file example:**
```json
{
  "source": "@kb-labs/devkit",
  "version": "1.2.3",
  "when": "2025-01-28T12:00:00Z",
  "scope": "managed-only",
  "items": ["ci", "agents", "cursorrules"],
  "report": {
    "schemaVersion": "2-min",
    "devkit": { "version": "1.2.3" },
    "summary": { "driftCount": 0 },
    "targets": [...]
  }
}
```

#### 2. Drift Detection Modes

- **`managed-only`** (default): Compare only files explicitly synced from DevKit (safe for mixed repos)
- **`strict`**: Compare entire target directories (flags unmanaged files as drift)
- **`all`**: Legacy mode, strict + unmanaged

#### 3. Configuration Controls

Repositories can adjust sync behavior in `kb-labs.config.json`:

```json
{
  "sync": {
    "enabled": true,
    "only": ["ci", "agents"],
    "disabled": ["sbom"],
    "scope": "managed-only",
    "force": false
  }
}
```

- Overrides and extra targets remain supported
- CLI flags take precedence over config settings

#### 4. Ignored Files Tracking

Drift check logs ignored files separately for transparency when using `managed-only` mode.

## Rationale

- **Transparent Ownership**: Provenance files provide clear audit trail of what DevKit manages
- **Flexible Enforcement**: Teams can choose appropriate drift detection strictness
- **False Positive Prevention**: `managed-only` mode eliminates noise from project-specific files
- **Scalable Design**: Strategy works as DevKit adds more sync targets
- **Operation Separation**: Separate files for sync and check operations provide better traceability and debugging capabilities

## Consequences

### Positive

1. **Prevents False Drift**: Eliminates false positives for extra project workflows
2. **Transparent Ownership**: Auditable provenance of all managed files
3. **Flexible Enforcement**: Teams can opt into stricter enforcement if desired
4. **Scalable**: Works well as DevKit adds more sync targets
5. **Backward Compatible**: Existing workflows continue to work

### Negative

1. **Complexity**: Slightly more complex provenance format
2. **Trust Requirements**: CI must trust provenance for `managed-only` mode
3. **Explicit Configuration**: Teams must explicitly choose `strict` for "no unmanaged files" policy

### Risks

1. **Provenance Tampering**: Malicious changes to provenance file could bypass drift detection
2. **Mode Confusion**: Teams may not understand the difference between drift modes
3. **Silent Failures**: `managed-only` mode might hide important unmanaged files

### Mitigation Strategies

1. **Documentation**: Clear explanation of drift modes and their implications
2. **Default Safety**: `managed-only` is the safe default for mixed repositories
3. **Transparency**: Log ignored files for visibility

## Implementation

### Phase 1: Core Infrastructure ✅

- [x] Extend sync to write provenance with items and scope
- [x] Implement drift detection modes (`managed-only`, `strict`, `all`)
- [x] Add CLI flags for scope control (`--scope=managed-only|strict|all`)
- [x] Support configuration via `kb-labs.config.json`
- [x] Create separate provenance files for sync (`DEVKIT_SYNC.json`) and check (`DEVKIT_CHECK.json`) operations

### Phase 2: Enhanced Features ✅

- [x] Ignored files tracking for transparency
- [x] JSON output mode for CI integration
- [x] Timeout protection for large repositories
- [x] Detailed operation reports in check provenance files

### Phase 3: Documentation ✅

- [x] Update docs/README to explain drift strategy
- [x] Add FAQ entry about project-specific workflows
- [x] Create migration guide for existing repositories
- [x] Update provenance files documentation to reflect dual file approach

## Alternatives Considered

### Always Strict Mode
- **Rejected**: Too many false positives in mixed repositories
- **Reason**: Would flag legitimate project-specific files as drift

### Ignore Unmanaged Files Silently
- **Rejected**: No visibility into what's being ignored
- **Reason**: Low transparency, potential security concerns

### File-by-File Whitelist
- **Rejected**: Too complex to maintain
- **Reason**: Would require explicit listing of every managed file

## References

- [ADR 0001: Repository Synchronization via DevKit](./0001-repo-synchronization-via-devkit.md)
- [ADR 0007: Reusable Workflow Strategy](./0007-reusable-workflow-strategy.md)
- [DevKit Sync Implementation](../sync/index.mjs)
- [DevKit README](../README.md)
