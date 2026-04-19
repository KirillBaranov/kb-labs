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

## Dev / Prod Config Switching

Config is layered (ADR-0012, ADR-0013). Switch by toggling `platform.dir` in `.kb/kb.config.json`.

### Dev mode (full adapters, local workspace packages)

Remove or comment out `platform.dir`:

```json
{ "platform": { /* "dir": "/Users/kirillbaranov/kb-platform", */ "adapters": { ... } } }
```

Bootstrap finds `node_modules` in the workspace → `platformRoot == projectRoot` → single-file mode → `.kb/kb.config.json` is authoritative for everything (openai, vibeproxy, redis, mongodb, qdrant all apply).

### Prod test mode (basic installed platform)

Set `platform.dir`:

```json
{ "platform": { "dir": "/Users/kirillbaranov/kb-platform", ... } }
```

Config loader reads `~/kb-platform/.kb/kb.config.jsonc` as base (kblabs-gateway, fs, pino). Platform-owned fields (`adapters`, `adapterOptions`, `execution`) from that file take effect; your rich dev adapters are overridden per policy.

### Config files

| File | Owner | Purpose |
|------|-------|---------|
| `.kb/kb.config.json` | You | Dev config: rich adapters, profiles, release, marketplace, gateway |
| `~/kb-platform/.kb/kb.config.jsonc` | kb-create | Installed platform defaults (basic adapters) |
| `.kb/kb.config.jsonc` | kb-create | Pointer-only (written only if no json exists). Gitignored. |

## Skills

Skills live in `.claude/skills/`. When you ask Claude to do something KB Labs-related,
the matching skill is invoked automatically. Do not edit skills by hand — they are
reinstalled by `kb-create update`.

Available skills:
- `.claude/skills/kb-labs-create-plugin/` — scaffold a new plugin
- `.claude/skills/kb-labs-create-product/` — scaffold a new service/product
- `.claude/skills/kb-labs-update/` — update the platform
- `.claude/skills/kb-labs-troubleshoot/` — diagnose failures
- `.claude/skills/kb-labs-explore/` — inspect what's installed
- `.claude/skills/kb-labs-quickstart/` — verify install, get started

<!-- BEGIN: KB Labs v1.5.0 (managed by kb-create) - DO NOT EDIT -->
## KB Labs Platform

This project uses the [KB Labs](https://github.com/KirillBaranov/kb-labs) platform.
A set of Claude Code skills is installed under `.claude/skills/kb-labs-*` to help
you work with the platform efficiently.

### Common tasks (just ask)

- **Create a plugin** — "create a kb-labs plugin called my-plugin"
- **Create a service** — "create a kb-labs service called my-service"
- **Troubleshoot** — "kb-labs is not starting" / "kb-dev shows failed"
- **Explore the project** — "what kb-labs services and plugins are installed here?"
- **Update the platform** — "update kb-labs to the latest version"

### Manual reference

- `pnpm kb --help` — list all platform commands
- `pnpm kb-dev status` — service status
- `pnpm kb-dev doctor` — environment diagnostics
- `pnpm kb plugins list` — installed plugins
- `kb-create update` — update the platform
- `kb-create doctor` — verify the installation

### Where things live

- `.kb/kb.config.jsonc` — project configuration (safe to edit)
- `.kb/` — platform runtime state (do not edit by hand)
- `.claude/skills/kb-labs-*` — managed skills (reinstalled by `kb-create update`)

For full platform documentation see https://github.com/KirillBaranov/kb-labs.
<!-- END: KB Labs (managed) -->
