# @kb-labs/mind-contracts

Wire contracts for the KB Labs **Mind** (RAG) plugin — the thin boundary shared
between the CLI, REST, and any other consumer.

Contains only Zod schemas, CLI flag definitions, route constants, and per-index
config resolution. Imports nothing but `@kb-labs/sdk` and `zod` — no platform
internals, no runtime logic.

## Exports

- **Schemas** — `index`, `search`, `query`/agent, `explore`, `sync`, `status`
  request/response shapes (`*RequestSchema` / `*ResponseSchema`).
- **Flags** — `indexFlags`, `searchFlags`, `askFlags`, `exploreFlags`,
  `syncPathsFlags`, `reindexFlags`, `statusFlags`.
- **Config** — `MindConfigSchema`, `effectiveIndexConfig(config, indexId)`
  (global config + named-index overrides).
- **Routes** — `MIND_BASE_PATH`, `MIND_ROUTES`, `MIND_FULL_ROUTES`.

## Layer

Layer 1 (contracts). Depended on by `@kb-labs/mind-core` and
`@kb-labs/mind-entry`; depends on nothing internal.
