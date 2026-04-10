# ADR-0001: Architecture and Repository Layout

**Date:** 2025-09-13
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [architecture, tooling]

## Context

KB Labs products must be consistent across repositories. Each repository should follow the same monorepo-style layout to support apps, packages, and fixtures.

## Decision

- Use PNPM workspaces for package management
- Repository root must contain:
  - `/apps` — example/demo apps or product UI
  - `/packages` — core logic, reusable libraries, domain modules
  - `/fixtures` — sample diffs, test inputs, reference data
  - `/docs` — ADRs, handbook, guides
- Shared configs (tsconfig, eslint, prettier, vitest) live in root

## Consequences

**Positive:**

- Consistent developer experience across products
- Easy onboarding: all repositories look alike
- Enables cross-product reuse of tools/scripts

**Negative:**

- Initial setup complexity for new repositories
