# ADR-0015: KB Labs DevLink Integration

**Date:** 2025-10-05  
**Status:** Accepted  
**Deciders:** KB Labs Team  

## Context

Monorepo workspaces (pnpm) introduced frequent cyclic dependencies and manual rebuilds. Developers wasted time linking, rebuilding, and publishing internal packages manually. We need a faster, unified mechanism for local linking and publishing without breaking CI.

## Decision

We introduce **KB Labs DevLink**, a lightweight development orchestrator replacing pnpm workspaces for inter-repo dependency management.

### Core Features
- Zero-config local linking (`devlink link`)
- Fast rebuilds and live updates across repositories
- Safe npm publishing pipeline (`devlink publish`)
- Transparent switch between local and npm modes
- No cyclic dependency issues

### Architecture Principles
- Each repository keeps its own independence (no workspace root coupling)
- `devlink` indexes all local `@kb-labs/*` packages recursively
- Local links managed via `.yalc` or `file:` references
- Publish flow uses npm (semver bump + auto tag + version sync)
- CI always pulls from npm to ensure clean reproducibility

## Rationale

**Benefits:**
- Faster feedback loop (no manual builds)
- Eliminates cyclic dependency errors
- Simplifies developer onboarding
- Standardized release and versioning model
- Works with single-developer and multi-repo setups

**Non-Goals:**
- Not a replacement for npm registry
- Not a global monorepo manager
- Not handling CI/CD builds itself

## Consequences

**Positive:**
- Faster development cycles with automatic linking and rebuilding
- Elimination of circular dependency issues
- Simplified developer experience and onboarding
- Consistent release and versioning processes

**Negative:**
- Requires consistent `package.json` versioning across repos
- Temporary duplication of local caches (`.yalc`)
- Initial setup cost before full automation

## Implementation

All KB Labs repositories migrate from pnpm workspace to devlink pipeline by default. `kb-labs-devlink` will serve as the single dependency management entrypoint.

## Related Decisions

- `kb-labs-devkit` — used as foundation for CLI scaffolding and configuration
- `kb-labs-cli` — will use devlink internally for development commands

---

*Last updated: October 5, 2025*  
*Next review: January 5, 2026*