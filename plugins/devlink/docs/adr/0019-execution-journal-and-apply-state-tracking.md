# ADR-0019: Execution Journal and Apply State Tracking

**Date:** 2025-10-12
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [tooling, observability]

## Context

After executing `devlink apply`, we needed to preserve the current monorepo state and the list of executed actions for:
- Subsequent analysis (diff, rollback, reapplication)
- Error diagnostics when apply is interrupted
- Building change history and metrics (future integration with kb-labs-analytics)

## Decision

Added **execution journal** and **state tracking** mechanisms:
- After each successful apply:
  - Perform a fresh `discover()` (current package state)
  - Form a `DevlinkState` object with metadata (version, generatedAt, package index)
  - Save state to `.devlink/state.json`
  - Save list of executed actions to `.devlink/journal/last-apply.json`

This allows reproducing the context of the last operation and tracking changes between sessions.

## Consequences

### Positive

- Ability to track any changes between two apply runs
- Simple integration with future `status`, `rollback`, `diff` commands
- Minimal performance impact (save <10ms)
- Unified state format (`DevlinkState`)

### Negative

- Local journal can be lost if `.devlink` is manually deleted
- Currently no change history (only last snapshot)

### Alternatives Considered

- Store state in `.yalc` — rejected to avoid context mixing
- Keep only in memory — rejected as persistent storage is needed between runs

## Implementation

- Added functions:
  - `saveState(state, rootDir)` — saves `.devlink/state.json`
  - `writeLastApply(plan, executed)` — saves `.devlink/journal/last-apply.json`
- Invoked after all operations complete (`applyPlan`)
- Format is minimal and suitable for JSON diff in analytics

## References

- [ADR-0015: Batching of Dependency Operations](./0015-batching-of-dependency-operations.md)
- [ADR-0018: Prefiltering of Already-Satisfied Dependencies](./0018-prefiltering-of-already-satisfied-dependencies.md)

