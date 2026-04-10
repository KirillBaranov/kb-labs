> **Note**  
> This ADR complements [ADR 0005: Build & Types Strategy for KB Labs Monorepos](./0005-build-strategy.md).  
> ADR 0005 defines *what tools and strategies* we use for builds and type generation.  
> ADR 0006 defines *how we orchestrate build order and dependency resolution* in monorepos.  

# ADR-0006: Sequential Build & Type Safety in KB Labs Monorepos

**Date:** 2025-09-24
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [tooling, architecture]

## Context
KB Labs monorepos (core, cli, shared, products) rely on multiple internal packages with cross-dependencies.  
During the CLI migration we faced issues:

- **Broken type resolution**: one package couldn’t see `.d.ts` files from another.
- **Parallel builds drift**: `pnpm -r run build` executed packages out of order.
- **Config sprawl**: some repos mixed `tsc --emitDeclarationOnly` with `tsup` and had inconsistent settings.

In practice, **pnpm workspaces already support topological build order**, but only if all `workspace:*` dependencies are declared correctly. Together with `tsup(dts: true)`, this eliminates most type resolution problems.

## Decision
1. **Sequential builds via pnpm topology**  
   - Each package must declare all workspace dependencies (`"@kb-labs/...": "workspace:*"`).  
   - Root build uses `pnpm -r run build` which respects topological order.  
   - In rare flaky CI cases, we enforce sequential execution with `--workspace-concurrency=1`.

2. **Type generation via tsup**  
   - All packages generate declarations through `tsup(dts: true)` (DevKit preset).  
   - No separate `tsc --emitDeclarationOnly` step unless explicitly justified.

3. **Public API via index.ts**  
   - Each package exposes its surface from a single `src/index.ts`.  
   - Ensures stable entrypoints for both JS and types.

4. **DevKit as source of truth**  
   - DevKit presets (`tsup/node`, `tsconfig/lib.json`, `eslint/node.js`, etc.) must be used.  
   - Consumers override minimally; no local forks of build configs.

## Rationale
- **Reliability**: Topological builds avoid “package not found” errors.  
- **Simplicity**: Single tool (`tsup`) generates JS + types.  
- **Consistency**: All repos follow the same pattern; no hidden per-package tweaks.  
- **Scalability**: New packages “just work” if they follow the template.

## Consequences
**Pros**  
- Predictable builds across all monorepos.  
- Clear dependency graph through `workspace:*`.  
- Less config duplication.  
- Faster onboarding of new repos.  

**Cons**  
- Mistakes in declaring workspace dependencies can silently break order.  
- Full reliance on DevKit presets requires strict version control and review.  

## Operational Notes
- **CI**: default to `pnpm -r run build`; use `--workspace-concurrency=1` if needed.  
- **Exports**: every package `package.json` must have `main`, `types`, and `exports` aligned to `dist/`.  
- **DevKit fixtures**: provide end-to-end sanity checks before publishing DevKit.  

## Migration Plan
1. Audit all KB Labs packages → ensure `workspace:*` declared in `package.json`.  
2. Remove old `tsc --emitDeclarationOnly` scripts.  
3. Switch to DevKit presets with `tsup(dts: true)`.  
4. Verify each package’s `src/index.ts` re-exports the public API.  
5. Update CI to run topological builds consistently.  

## Alternatives Considered
- **Keep `tsc --emitDeclarationOnly`**: more configs, drift between tsup and tsc outputs.  
- **Manual build orchestration**: brittle, extra tooling not needed when pnpm topology already solves it.  
- **Hybrid CJS/ESM**: discarded; KB Labs enforces ESM-only.  

## Follow-ups
- Extend DevKit fixtures to simulate multi-package builds and detect drift.  
- Add CI job in product-template that checks build order correctness.  
- Write guideline: “How to debug missing workspace dependencies and broken topology”.
