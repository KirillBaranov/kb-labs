# ADR-0018: Prefiltering of Already-Satisfied Dependencies

**Date:** 2025-10-12
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [performance, tooling]

## Context

During the performance optimization phase of `devlink apply`, it was discovered that a significant portion of time was spent on reinstalling packages that were already present in `node_modules` or `yalc.lock`.

Previously, the system unconditionally executed all actions from `LinkAction[]`, even if dependencies were already in the correct state.

This led to:
- Redundant `pnpm add` / `yalc add` calls
- Unnecessary lockfile rebuilds
- Excessive disk load with many packages (30+)
- "False" dependency changes (postinstall, rebuild, etc.)

A prefiltering layer was needed to skip obviously satisfied dependencies.

## Decision

Added a **prefiltering mechanism** (prefilter actions) executed before the `applyPlan` phase:

1. For each target, build a list of existing dependencies:
   - Read `package.json` and `yalc.lock` (if present)
   - Form an `installedDeps` set
2. Before executing commands:
   - Check each `LinkAction` against `installedDeps`
   - If the dependency already exists (and matches version/link), exclude it from the apply plan
3. Display diagnostic message in logs:

```
ℹ Skipped 17 already satisfied dependencies
```

Thus, only actual changes are executed.

## Consequences

### Positive

- Reduced installation operations by 40–80% in typical scenarios
- Real execution time decreased from 300,000 ms → 825 ms
- Stabilized PNPM behavior: fewer lockfile recreations
- Eliminated unnecessary rebuild scripts and postinstall calls
- Cleaner console — less noise and false errors

### Negative

- Additional reading of `package.json` and `yalc.lock` slightly increases overhead during dry-run (negligible)
- Possible false skips when package version is manually changed (will be resolved with version checking)
- Requires caching of `discover()` results for maximum efficiency

### Alternatives Considered

- Completely abandon prefilter and rely on pnpm for idempotency — rejected, as pnpm still accesses lockfile and registry
- Perform prefilter post-factum (at error level) — rejected due to inability to prevent I/O upfront

## Implementation

- Added `prefilterActions(plan)` step before `applyPlan`
- Checking via `package.json.dependencies`, `devDependencies`, `yalc.lock`
- Logic is flexible — can be enabled via `opts.prefilter = true`
- Future plans include version diff implementation (semver-aware check)

## References

- [ADR-0015: Batching of Dependency Operations](./0015-batching-of-dependency-operations.md)
- [ADR-0017: PNPM Flags Normalization](./0017-pnpm-flags-normalization.md)
- [ADR-0019: Execution Journal and Apply State Tracking](./0019-execution-journal-and-apply-state-tracking.md)

