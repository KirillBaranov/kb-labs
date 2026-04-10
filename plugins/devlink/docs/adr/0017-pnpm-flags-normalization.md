# ADR-0017: PNPM Flags Normalization

**Date:** 2025-10-12
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [tooling, process]

## Context

In early versions of `devlink apply`, `pnpm add` was invoked directly, passing flags explicitly (`--no-frozen-lockfile`, `--reporter=silent`).

However:
- Different pnpm versions could interpret flags differently (e.g., `--no-frozen-lockfile` → error in pnpm@9)
- There was no centralized control over installation options
- Couldn't flexibly manage behavior through environment (e.g., disable scripts or optional dependencies)

This led to fragile commands, inconsistent logs, and compatibility issues in both CI and local runs.

## Decision

Introduced a single centralized mechanism for generating PNPM arguments:

```javascript
const PNPM_FLAGS = "--lockfile=false --reporter=silent --prefer-offline";
```

Later extended with `getPnpmFlags()` function (to be extracted to utils):
- Base options:
  - `--lockfile=false` — prevents recreating `pnpm-lock.yaml`
  - `--reporter=silent` — suppresses unnecessary noise
  - `--prefer-offline` — uses local cache for speed
- Dynamic (environment-dependent):
  - `KB_DEVLINK_IGNORE_SCRIPTS=1` → adds `--ignore-scripts`
  - `KB_DEVLINK_NO_OPTIONAL=1` → adds `--no-optional`
  - `KB_DEVLINK_NO_LOCKFILE=1` → excludes `--lockfile=false` (if lockfile preservation is needed)

Thus, all `pnpm add` calls are unified and resilient to PNPM updates.

## Consequences

### Positive

- Single source of truth for all pnpm flags
- Eliminated errors with `--no-frozen-lockfile` on newer PNPM versions
- Flexible control via environment variables
- Increased speed due to `--prefer-offline` and suppressed output

### Negative

- Loss of ability to use "strict lockfile mode" (CI will require a separate flag)
- Creates an abstraction layer that needs synchronization with future PNPM changes
- Possible conflicts with custom user flags (will need to document exceptions)

### Alternatives Considered

- Keep existing behavior and manually patch pnpm versions — rejected, too unstable
- Use npm/yarn in fallback mode — rejected due to lack of workspace compatibility

## Implementation

- `PNPM_FLAGS` constant extracted to the top of `apply.ts` module
- All `pnpmAddCmd` calls now use the common flag set
- Removed incompatible `--no-frozen-lockfile` calls
- Added support for env flags affecting installation
- This change reduced "Unknown option" errors and sped up apply by approximately 20–25%

## References

- [ADR-0015: Batching of Dependency Operations](./0015-batching-of-dependency-operations.md)
- [ADR-0018: Prefiltering of Already-Satisfied Dependencies](./0018-prefiltering-of-already-satisfied-dependencies.md)

