# ADR-0001: Repo Synchronization via DevKit

**Date:** 2025-09-18
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [tooling, process]

## Context
KB Labs maintains multiple repositories (core, cli, shared, ai-review, templates). They all share non-domain tooling: ESLint/Prettier configs, TS baselines, Vitest presets, Tsup presets, GitHub reusable workflows, Cursor agents, and workspace conventions.

Duplicating these assets across repos leads to drift and repetitive maintenance. We need a single source of truth and a frictionless way to propagate updates.

## Decision
We centralize shared tooling and agent definitions in **`@kb-labs/devkit`** and expose a **sync workflow**:

- **Authoritative assets in DevKit:**
  - ESLint/Prettier/Vitest/Tsup/TS configs (as presets/exports).
  - Reusable GitHub Actions/workflows.
  - Cursor AI agents (`/agents`, `.cursorrules`, `AGENTS.md`).
- **Consumer repos** (templates/products) are thin wrappers that **import/extend** DevKit and can **sync** static assets via a single command:
  - `pnpm agents:sync` (copies `/agents`, `.cursorrules`, `AGENTS.md` from DevKit).
  - Future sync entrypoints may cover additional static assets.

DevKit keeps **peerDependencies** for ESLint and TypeScript toolchain to avoid version duplication. Consumers pin versions in their root.

## Rationale
- **Single source of truth** → consistent developer experience.
- **Low-friction adoption** → one command to sync agents; thin local configs.
- **Safe evolution** → changes are proposed and documented once (in DevKit), consumers update on demand.

## Consequences
**Pros**
- Faster onboarding and upgrades.
- Fewer “snowflake” configs.
- Clear responsibility: changes in DevKit ripple cleanly to consumers.

**Cons**
- Consumer repos depend on DevKit availability and versioning.
- A DevKit mistake can affect multiple repos (mitigated by reviews and semantic versioning).

## Operational Notes
- DevKit provides a small CLI for syncing agents (`kb-labs-agents-sync`).
- Consumers should reference DevKit presets directly (import/extends) and avoid local forks.
- Reusable CI is consumed via `uses: KirillBaranov/kb-labs-devkit/.github/workflows/...@v1` (or `@main` during bootstrap).

## Alternatives Considered
- Per-repo configs: rejected due to maintenance cost and drift.
- External generic presets only: rejected; KB Labs requires opinionated integration (workspaces, monorepo, actions, agents).

## Follow-ups
- Add a “sync-all” CI job to open PRs in consumer repos when DevKit changes require updates.
- Document versioning policy for DevKit (tags v1/v2 for reusable workflows).
