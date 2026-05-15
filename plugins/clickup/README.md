# @kb-labs/clickup
A KB Labs plugin
## Layout

```
packages/
  clickup-contracts/   # public types (request/response shapes)
  clickup-core/        # pure business logic (testable in isolation)
  clickup-entry/       # V3 manifest + CLI command handlers
```

All three packages are published together. `entry` depends on `core`, `core`
depends on `contracts`. The runtime discovers the plugin through the `"kb"`
field in `clickup-entry/package.json`.

## Getting started

```bash
pnpm install
pnpm -w build
pnpm kb clickup hello                # say hi
pnpm kb clickup hello --who=World    # same, explicit
```

## What to edit

- **Business logic:** [packages/clickup-core/src/hello.ts](./packages/clickup-core/src/hello.ts)
  Inline comments show how to call the LLM, use the cache, and log through
  the platform — everything goes through `@kb-labs/sdk`, never through
  `@kb-labs/core-*` or `@kb-labs/platform-*`.
- **CLI surface:** [packages/clickup-entry/src/manifest.ts](./packages/clickup-entry/src/manifest.ts)
  Add more commands by appending to `cli.commands[]` and creating a handler
  in `src/commands/`.
- **Shared types:** [packages/clickup-contracts/src/index.ts](./packages/clickup-contracts/src/index.ts)
  Input/output shapes go here so `core` and `entry` agree on them.

## Linking into a workspace (development)

```bash
pnpm kb marketplace plugins link .
pnpm kb marketplace plugins refresh
```

## Health check

```bash
pnpm kb scaffold doctor --path .
```

## License

MIT