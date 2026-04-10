# KB Labs Monorepo

> Single monorepo for the KB Labs platform — open-source AI/infra control plane for developers.

## Quick Start

```bash
pnpm install          # one lockfile, ~20 seconds
pnpm build            # kb-devkit run build (topological order)
pnpm check            # lint + type-check + test
kb-dev start          # start all services (gateway, rest-api, workflow, etc.)
```

## Structure

```
core/              → Foundation: types, runtime, config, discovery, registry, plugin-system
sdk/               → Public API for plugin authors
cli/               → CLI framework (kb command)
shared/            → Utilities: cli-ui, http, testing, command-kit
plugins/           → ALL optional functionality (duck typing rule)
  mind/            → RAG, embeddings, vector search
  agents/          → Autonomous agents, MCP
  workflow/        → Workflow engine + daemon :7778
  gateway/         → API gateway :4000 (required for any HTTP service)
  rest-api/        → Main API :5050
  marketplace/     → Entity marketplace :5070
  state/           → State daemon :7777
  commit/          → AI commits
  review/          → AI code review
  release/, quality/, qa/, impact/, policy/, infra-worker/, devlink/
  host-agent/      → Remote workspace agent
adapters/          → Interface implementations (llm-openai, logging-pino, storage-*, etc.)
infra/devkit/      → Build configs: tsconfig, eslint presets
studio/            → Web UI (SPA + ui-kit + hooks)
tools/             → Go binaries: kb-devkit, kb-dev, kb-create
sites/             → Product website
templates/         → Plugin/product starter templates
```

## Dependency Rules

```
Layer 0:  core/
Layer 1:  sdk/  shared/  core/plugin-*
Layer 2:  cli/  adapters/
Layer 3:  plugins/
Layer 4:  studio/
```

Dependencies flow **strictly downward**. Never import from a higher layer.

## Key Conventions

### Dependencies
- **All internal deps use `workspace:*`** — never `link:`, never pinned versions
- pnpm resolves `workspace:*` locally; replaces with `^version` on `pnpm publish`
- No DevLink, no mode switching, no submodules

### Building
- Use `kb-devkit run build` (or `pnpm build`) — respects topological order
- Use `kb-devkit run build --affected` for incremental builds
- After building CLI plugins: `pnpm kb plugins clear-cache`

### Plugin = Duck Typing
Everything in `plugins/` is a plugin. If it uses SDK, registers commands, has a manifest — it's a plugin.
Some have daemons (HTTP ports) — that's an implementation detail, not an architectural boundary.

### Services
- `kb-dev start` — starts all services via Go binary
- Services with HTTP require `gateway` plugin (auth, routing)
- Ports: gateway :4000, rest-api :5050, workflow :7778, marketplace :5070, state :7777

### Config Files — DO NOT MODIFY
- `devservices.yaml` — port assignments (change scripts, not ports)
- `devkit.yaml` — task runner config (categories, presets)
- `pnpm-workspace.yaml` — workspace package globs

### Code Style
- Always use `ILogger`/`ICache` from `@kb-labs/core-platform`
- Use `platform.logger` for noop logger instances
- Never use `as any`, `@ts-ignore`, or duplicate types — fix root causes
- Never create stub/mock files as workarounds

### Git
- Never `git push` without explicit permission
- Never amend commits — create new ones
- Build with `kb-devkit` build-order, NOT `pnpm -r` (DTS ordering matters)

## Documentation

- Cross-cutting ADRs: `docs/adr/`
- Module-specific ADRs: `<module>/docs/adr/`
- ADR template: `docs/templates/adr-template.md`

## Common Tasks

```bash
# Search code semantically
pnpm kb mind rag-query --text "your question" --agent

# Run specific plugin tests
pnpm --filter @kb-labs/mind-engine test

# Type-check one package
pnpm --filter @kb-labs/core-types type-check

# Build affected packages only
kb-devkit run build --affected

# Check workspace health
kb-devkit health

# Install a marketplace entity
pnpm kb marketplace install <entity>
```

## Anti-Patterns

- **DO NOT** use `pnpm -r run build` — use `kb-devkit run build` (respects build order)
- **DO NOT** add `link:` dependencies — always `workspace:*`
- **DO NOT** import Studio internals from plugin pages — only `@kb-labs/sdk` + contracts
- **DO NOT** run services with `node ./path` — use `kb-dev start`
- **DO NOT** modify ports in `devservices.yaml` — fix the scripts instead
