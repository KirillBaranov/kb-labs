# Mind Contracts Guide

This note explains how we publish and evolve the public contract for Mind. The contract lives in `packages/contracts` and is consumed by CLI, REST, and Studio surfaces as well as other plugins.

## Package layout

`@kb-labs/mind-contracts` is intentionally lightweight:

- `src/types/` – TypeScript definitions for artifacts, commands, workflows, and REST APIs.
- `src/schema/` – Zod schemas (including Mind-specific helpers in `mind.contracts.schema.ts`) used for runtime validation.
- `src/contract.ts` – `pluginContractsManifest`, the single source of truth for exported capabilities.
- `src/version.ts` – `contractsVersion` and `contractsSchemaId` constants.
- `tests/` – Vitest coverage that parses the manifest with the schema and enforces SemVer formatting.

Consumers must import from the package instead of hard-coding IDs:

```ts
import { pluginContractsManifest } from '@kb-labs/mind-contracts';

const PACK_ARTIFACT_ID =
  pluginContractsManifest.artifacts['mind.pack.output']?.id ?? 'mind.pack.output';
```

## Versioning rules

`contractsVersion` follows Semantic Versioning and is **decoupled** from the npm version of the package:

- **MAJOR** – breaking changes: removing or renaming artifacts/commands, changing required fields, incompatible schema updates, or altering REST semantics.
- **MINOR** – additive, backward-compatible changes: new artifacts/commands/workflows, optional fields, relaxed validation, or additional REST routes.
- **PATCH** – documentation updates, schema clarifications, or non-behavioural fixes.

The version bump is recorded only in `src/version.ts`. `package.json` stays private, but we update it if tooling requires a release.

### Change checklist

When modifying the contract:

1. Update types/schemas **and** the manifest entry together.
2. Rev the `contractsVersion` as per the rules above.
3. Adjust usage sites (CLI, REST handlers, Studio widgets, docs) to consume the new IDs or schemas.
4. Regenerate paths: `pnpm devkit:paths`.
5. Validate the package: `pnpm --filter @kb-labs/mind-contracts test && pnpm --filter @kb-labs/mind-contracts type-check`.
6. Run integration tests for surfaces: `pnpm --filter @kb-labs/mind-cli test` (and other surfaces once they exist).
7. Document the change (changelog entry, ADR update if required).

## Compatibility guarantees

- All Mind surfaces must reference artifacts via the manifest, never by duplicated string literals.
- Schemas exported from `@kb-labs/mind-contracts/schema` are the canonical definitions for CLI flags, JSON responses, REST payloads, and Studio widgets.
- Contracts should not import Node-specific modules; keep the package tree-shakeable and reusable across runtimes.

## Breaking-change protocol

If a breaking change is unavoidable:

1. Propose it via an ADR or design note describing migration steps for consumers.
2. Bump `contractsVersion` to the next major value (`1.x.x` → `2.0.0`).
3. Provide transitional helpers or feature flags where possible.
4. Coordinate releases of dependent surfaces and update documentation.

## Helpful commands

```bash
# Validate contracts package
pnpm --filter @kb-labs/mind-contracts test
pnpm --filter @kb-labs/mind-contracts type-check

# Verify CLI/REST integration
pnpm --filter @kb-labs/mind-cli test

# Sync devkit-generated paths after contract edits
pnpm devkit:paths
```

Keep this document in sync whenever we add new surfaces (e.g. Studio dashboards) or extend the contract model.
