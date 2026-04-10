# Mind Extensibility Guide

This guide explains how to extend the Mind plugin with new indexers, pack sections, and query types. It points to the core extension points already in the repository so that new functionality can be added without duplicating logic. Review [Mind Contracts Guide](./mind-contracts.md) alongside this document to keep `@kb-labs/mind-contracts` aligned with any new surfaces.

## 1. Adding a New Indexer

Mind indexers live in `packages/mind-indexer/src/indexers/`. Each indexer is responsible for populating a portion of the `.kb/mind` workspace.

### Steps

1. **Create the indexer module** under `src/indexers/`. Export an async function that accepts `IndexerContext`.
2. **Update the orchestrator** in `packages/mind-indexer/src/orchestrator/orchestrator.ts` to invoke the new indexer. Respect the time-budget checks just like the existing indexers (`indexApiFiles`, `indexDependencies`, etc).
3. **Persist output** using the helpers in `src/fs/json.ts` to ensure deterministic formatting.
4. **Extend types** if the new index needs to surface data to other packages. Update `packages/mind-indexer/src/types/index.ts` and `@kb-labs/mind-types` where appropriate.
5. **Add tests**: create fixtures if necessary and cover the new indexer in `src/__tests__/orchestrator.spec.ts` or a dedicated spec.

## 2. Adding a Pack Section

Pack sections are built in `packages/mind-pack/src/sections/` and composed by `src/builder/orchestrator.ts`.

### Steps

1. **Create a section builder** under `src/sections/`. Follow the pattern of existing builders (`intent.ts`, `docs.ts`, etc.): return the rendered markdown and the token count.
2. **Register the section** in `src/builder/orchestrator.ts`. Add the builder call, store the result in `sections`, and update `sectionUsage`.
3. **Update formatting helpers**:
   - Add the section key to the ordering in `src/formatter/markdown.ts`.
   - If the section needs a dedicated budget cap, update `DEFAULT_BUDGET` in `@kb-labs/mind-core`.
4. **Type updates**: extend the `ContextPackJson` type in `packages/mind-types` if the section should appear in the JSON output.
5. **Tests**: extend `packages/mind-pack/src/__tests__/builder.spec.ts` to assert the section exists, and add fixture data if needed.

## 3. Adding a Query Type

Query implementations live in `packages/mind-query/src/queries/`, and the dispatcher is `src/api/execute-query.ts`.

### Steps

1. **Create the query module** in `src/queries/` and export a function that receives query parameters and the relevant indexes.
2. **Wire the query** into the switch statement in `execute-query.ts`. Add any additional metadata (e.g., `filesScanned`, `edgesTouched`) required for analytics.
3. **Expose types**: update `QueryName` / `QueryResult` in `@kb-labs/mind-types` so the new query is part of the shared API.
4. **Cache keys**: if the query output depends on additional parameters, ensure they are captured when calling `QueryCache.set`.
5. **Add CLI binding** by editing `packages/mind-cli/src/cli/query.ts` and updating the manifest (`manifest.v3.ts`) so the command is discoverable.
6. **Tests**: add unit tests under `packages/mind-query/src/__tests__/` and integration coverage via `packages/mind-tests`.

## Validation Checklist

- [ ] Update or add fixtures under `fixtures/` if new data sources are required.
- [ ] Run `pnpm --filter @kb-labs/mind-indexer test`, `pnpm --filter @kb-labs/mind-pack test`, and `pnpm --filter @kb-labs/mind-query test`.
- [ ] Update documentation references (`README.md`, API specs) when new surface area is exposed.

Following these steps keeps all extensions aligned with the existing orchestration, budget management, and determinism guarantees.***






