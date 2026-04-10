# ADR-0006: Adopt DevKit Synchronization

**Date:** 2025-09-18
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [tooling, process]

## Context

This template inherits shared tooling from `@kb-labs/devkit`: ESLint/Prettier/Vitest/Tsup/TS presets, reusable CI, and preconfigured Cursor agents. Without a clear sync mechanism, templates and products could diverge from the central standards.

## Decision

The template **adopts DevKit synchronization**:

- Tooling configs are **thin wrappers** over DevKit exports (no local forks)
- Cursor agents (`/agents`, `.cursorrules`, `AGENTS.md`) are synchronized from DevKit via:
  ```bash
  pnpm agents:sync
  ```
- Before major contributions and releases, run the sync to ensure alignment

## Consequences

**Positive:**

- Guarantees consistency with KB Labs standards
- Reduces setup time for new products
- Keeps docs and agents up-to-date without manual copy/paste
- Minimal boilerplate
- Centralized updates; predictable upgrades

**Negative:**

- Requires DevKit availability and version pinning
- Local deviations must be explicitly justified (and usually upstreamed to DevKit)

## Implementation

- `eslint.config.js`, `vitest.config.ts`, `tsconfig.base.json` extend/import DevKit presets
- `pnpm agents:sync` copies the latest agent definitions
- CI reuses DevKit workflows via `uses: KirillBaranov/kb-labs-devkit/.github/workflows/...@main` (or versioned tags later)

## References

- DevKit ADR: `@kb-labs/devkit/docs/adr/0001-repo-synchronization-via-devkit.md`
