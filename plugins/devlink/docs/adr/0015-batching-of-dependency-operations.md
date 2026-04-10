# ADR-0015: Batching of Dependency Operations

**Date:** 2025-10-12
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [performance, tooling]

## Context

The early implementation of `devlink apply` executed `pnpm add` and `yalc add/remove` commands after each individual dependency, resulting in hundreds of independent CLI invocations.

In a monorepo with dozens of packages, this led to:
- Excessive execution time (up to 300,000+ ms)
- Multiple lockfile rebuilds
- Constant I/O load and network lookups
- Visual noise in the console due to numerous repetitive logs

It was necessary to reduce the number of external calls while maintaining the correctness of links (yalc, workspace, npm).

## Decision

Instead of sequential execution for each dependency, we implemented **Batching by Target** — consolidating all operations for each target package into a single batch (`TargetBatch`).

Each batch maintains separate sets of dependencies:
- `yalcAdd`, `yalcRemove`
- `npmProd`, `npmDev`, `npmPeer`
- `wsProd`, `wsDev`, `wsPeer`

Algorithm:
1. Group `LinkAction[]` by target
2. For each target, create one set of batched commands
3. Execute:
   - `yalc remove` (all in one call)
   - `yalc add` (single call with `--link`)
   - Then all necessary `pnpm add` operations by dependency type
4. Record the result in `executed` / `errors` with a single journal entry

## Consequences

### Positive

- Execution time reduced by orders of magnitude (300s → 0.8s)
- Reduced number of spawn calls and lockfile operations
- Improved stability and log readability
- Enabled visual progress tracking per target

### Negative

- Errors within a batch obscure which specific dependency failed
- Will require additional granularity in the future (batch sub-errors)
- Potential debugging complexity for individual packages

### Alternatives Considered

- Completely abandon batching and use parallel `Promise.all` — rejected as it would create race conditions and stdout confusion
- Use `pnpm recursive install` for the entire monorepo — rejected as it doesn't provide control at the yalc and workspace link level

## Implementation

- Added `TargetBatch` type
- Refactored the `for (const target of targets)` loop — operations are now executed in groups
- Updated progress bar: now each iteration corresponds to one package
- `ensureBatch()` function creates and manages dependency sets

Future plans include augmenting the mechanism with state caching and intelligent dependency filtering (see [ADR-0018](./0018-prefiltering-of-already-satisfied-dependencies.md)).

## References

- [ADR-0016: Progress Rendering (Pinned Loader Line)](./0016-progress-rendering-pinned-loader-line.md)
- [ADR-0018: Prefiltering of Already-Satisfied Dependencies](./0018-prefiltering-of-already-satisfied-dependencies.md)

