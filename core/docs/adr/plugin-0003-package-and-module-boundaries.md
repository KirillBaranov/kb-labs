# ADR-0003: Package and Module Boundaries

**Date:** 2025-09-13
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [architecture, process]

## Context

Products in KB Labs often require multiple internal packages. Without strict boundaries, cross-dependencies can grow messy and unmaintainable.

## Decision

- Every package under `/packages` must define:
  - `src/` — implementation
  - `index.ts` — public entry point
  - `types/` — exported types & schemas
- Packages must only depend on public exports of other packages
- Cross-package imports must use workspace aliases (`@kb-labs/<pkg>`)
- Domain rules:
  - Core logic in `@kb-labs/core`
  - Product-specific code in `@kb-labs/<product>`
  - Experimental code → feature packages, not core

## Consequences

**Positive:**

- Prevents tight coupling
- Core remains minimal and reusable
- Easier to extract packages as standalone OSS later

**Negative:**

- Requires discipline to maintain boundaries
- More complex dependency management
