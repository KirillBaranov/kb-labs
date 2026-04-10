# ADR-0005: Core Facade Package

**Date:** 2025-09-16
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [architecture, api]

## Context
The ecosystem has multiple low-level packages (`@kb-labs/core-config`, `@kb-labs/core-sys`, `@kb-labs/cli-core`). Direct imports from each package create cognitive load for consumers (CLI, Shared, AI-review) and may break if internal structure changes. We need a stable and simple entry point.

## Decision
Introduce `@kb-labs/core` as a facade package:
- It re-exports all public functions and types from low-level core packages.
- Consumers must import only from `@kb-labs/core` for stability.
- Internal packages remain modular and may evolve independently.

#### Example
```ts
// Instead of importing from core-config/sys separately
import { loadConfig, configureLogger, getLogger } from "@kb-labs/core";
```

#### Exports include
- Config: `loadConfig`, `ResolvedConfig`, `SentinelRc`, …
- Sys: `configureLogger`, `getLogger`, `stdoutSink`, `jsonSink`, `findRepoRoot`
- CLI contracts: `CliCommand`, `CliContext`, `parseArgs`, `presenters`

## Consequences
- ✅ Simplified DX: one import path for all core features.
- ✅ Stability: internal refactors don’t affect consumers.
- ✅ Modularity preserved: internal packages still separate for maintenance.
- ⚠️ Bundle size (future): in browser contexts, tree-shaking must be verified. If needed, add subpath exports (`@kb-labs/core/logging`, etc.) later.

## Future Work
- Add subpath exports only if web/bundle optimization becomes relevant.
- Keep `@kb-labs/core` as the canonical stable contract for all products.