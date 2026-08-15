# KB Labs Monorepo

> Single monorepo for the KB Labs platform — open-source AI/infra control plane for developers.

## Quick Start

```bash
pnpm install          # one lockfile, ~20 seconds
pnpm build            # kb-devkit run build (topological order)
pnpm check            # lint + type-check + test
kb-dev start          # start all services (gateway, rest-api, workflow, etc.)
```

## Which `kb` binary to run

Three different things answer to "kb" on this machine — do not mix them up:

| Command       | What it runs                                                              | When to use |
| ------------- | --------------------------------------------------------------------------- | ----------- |
| `kb ...`      | **Prod.** Global binary in `~/.local/bin` (installed/updated only by `kb-create`), points at the installed platform, NOT this repo. | Use the stable, already-released platform/services/plugins — e.g. writing/pushing real commits, running release steps, anything that should behave exactly as it does for a normal user. Never for developing `kb-labs-workspace` itself. |
| `pnpm kb ...` | **Dev.** Runs `node ./cli/bin/dist/bin.js` via the root `package.json` script — always this workspace's local build. | Developing new functionality, testing changes not yet released, working locally against the code you're editing. Fine in docs/scripts. Note: `pnpm run` echoes `$ node ...` before output and prints `ELIFECYCLE ...` on failure — both pollute `--json` output and confuse parsers. Use `pnpm -s kb ...` to suppress. |
| `dev-kb ...`  | **Dev.** Local `~/.zshrc` shell function — `node` invoked directly against this workspace's `cli/bin/dist/bin.js`, no pnpm wrapper. | Same cases as `pnpm kb`, preferred when scripting, piping `--json`, or checking exit codes — zero extra output around the CLI's own result. |

Rule of thumb: **dev = testing/building something that isn't stable/released yet; prod = using what's already stable and shipped** (e.g. committing real work, running a release). `~/.local/bin` is prod-owned territory — never symlink or copy a locally built binary there (see the 2026-08-12 incident: dev links planted there rotted when `/tmp` got reclaimed). For local development work, always reach for `pnpm kb` / `dev-kb` instead.

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
- CLI discovery cache auto-invalidates on rebuild (content hash check)
- Force-reset if needed: `pnpm kb marketplace plugins refresh`

### Plugin = Duck Typing

Everything in `plugins/` is a plugin. If it uses SDK, registers commands, has a manifest — it's a plugin.
Some have daemons (HTTP ports) — that's an implementation detail, not an architectural boundary.

### Services

- `kb-dev start` — starts all services via Go binary
- Services with HTTP require `gateway` plugin (auth, routing)
- Ports: gateway :4000, rest-api :5050, workflow :7778, marketplace :5070, state :7777

### Config Files — DO NOT MODIFY (without explicit reason)

- `devservices.yaml` — port assignments (change scripts, not ports)
- `devkit.yaml` — `categories` and `presets` sections are load-bearing; change carefully.
  `tasks` and `custom_checks` sections are safe to extend (adding new entries does not break existing behaviour).
- `pnpm-workspace.yaml` — workspace package globs

### Code Style

- Always use `ILogger`/`ICache` from `@kb-labs/core-platform`
- Use `platform.logger` for noop logger instances
- Never use `as any`, `@ts-ignore`, or duplicate types — fix root causes
- Never create stub/mock files as workarounds

### Platform Adapter Pipeline (`core/plugin-runtime`)

Platform adapters go through a named slot pipeline: `raw → router → post-router → resource-broker → post-resource-broker → governance`.

- **Single source of truth**: `ADAPTER_REGISTRY` in `core/plugin-runtime/src/platform/adapter-registry.ts` — adding a field to `PlatformServices` without a registry entry causes a compile error.
- **Phase 1** — `assemblePlatform(raw, config, broker)` — applies router + resource-broker factories once at startup.
- **Phase 2** — `applyPluginGovernance(platform, permissions, pluginId, middlewares)` — applies adapter middlewares sorted by slot/priority, then system governance last.
- **Adding an adapter**: one entry in `ADAPTER_REGISTRY`, governance wrap function, IPC strategy.
- **Adding a system stage**: one entry in `PIPELINE_SLOTS` + position in `SLOT_ORDER` — existing middleware priorities are unaffected.
- **EventBus IPC**: bidirectional — `EventBusProxy` in worker processes forwards subscribe/unsubscribe to parent via `sendMessage`, parent delivers events via `eventbus:push`.

See [ADR-0001](core/plugin-runtime/docs/adr/ADR-0001-adapter-pipeline.md) and [plugin-runtime README](core/plugin-runtime/README.md#platform-adapter-pipeline).

### Git

- Never `git push` without explicit permission
- Never amend commits — create new ones
- Build with `kb-devkit` build-order, NOT `pnpm -r` (DTS ordering matters)

## Documentation

- Cross-cutting ADRs: `docs/adr/`
- Module-specific ADRs: `<module>/docs/adr/`
- ADR template: `docs/templates/adr-template.md`

## Task Research (RAG)

**Before starting any non-trivial task**, use RAG to find relevant files. Do not guess file locations or read speculatively.

```bash
# Run 1-3 targeted queries covering what exists, where it's called, and what types are involved
pnpm kb mind ask --text "how does X work" --agent 2>/dev/null | grep "^{"
```

Parse the JSON: read files from `sources`, trust code over `kind: "adr"`. If `confidence < 0.4`, run a follow-up with exact identifiers (`ClassName`, `functionName`, `file.ts`). See `.claude/skills/task-rag.md` for the full workflow.

## Testing

Three-level pyramid (see `.claude/skills/testing.md` for decision tree and templates):

| Level   | What                                | Where                                | Run                                |
| ------- | ----------------------------------- | ------------------------------------ | ---------------------------------- |
| Handler | CLI command logic, mock HTTP client | `plugins/*/entry/src/__tests__/cli/` | `pnpm --filter <pkg> run test:cli` |
| SSE/WS  | Streaming behaviour, real daemon    | `e2e/<domain>/specs/sse/`, `.../ws/` | `cd e2e/<domain> && pnpm e2e`      |
| Journey | Multi-step user scenarios           | `e2e/<domain>/specs/cli/`            | `kb-devkit run e2e`                |

```bash
# Handler tests — fast, no daemon needed
pnpm --filter @kb-labs/workflow-entry run test:cli

# All plugin handler tests at once
kb-devkit run test:cli

# SSE/WS integration tests (need kb-dev start first)
kb-dev start && cd e2e/workflows && pnpm e2e
```

Key helpers in `@kb-labs/shared-testing-e2e`:

- `mockCLIInput<F>()`, `createCapturedUI()`, `createMockContext()` — handler tests
- `collectSseEvents()`, `expectSseTerminates()`, `assertSseOrder()` — SSE tests
- `withWs()`, `expectWsMessage()`, `expectWsClose()` — WS tests

### Bug fix rule

Every bug fix **must** be accompanied by a test that fails before the fix and passes after. No exceptions. The test documents the root cause and prevents regression.

## Common Tasks

```bash
# Search code semantically (sources-first); use `mind ask --agent` for a grounded answer
pnpm kb mind search --text "your question"

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

| File                                | Owner     | Purpose                                                            |
| ----------------------------------- | --------- | ------------------------------------------------------------------ |
| `.kb/kb.config.json`                | You       | Dev config: rich adapters, profiles, release, marketplace, gateway |
| `~/kb-platform/.kb/kb.config.jsonc` | kb-create | Installed platform defaults (basic adapters)                       |
| `.kb/kb.config.jsonc`               | kb-create | Pointer-only (written only if no json exists). Gitignored.         |

## Skills

Skills live in `.claude/skills/`. Folder-based skills (`SKILL.md`) are user-invocable; flat `.md` files are context skills that load automatically by glob pattern.

### User-invocable (folder-based)

| Skill           | Path                                     | Trigger                                     |
| --------------- | ---------------------------------------- | ------------------------------------------- |
| Create plugin   | `.claude/skills/kb-labs-create-plugin/`  | "create a kb-labs plugin called X"          |
| Create product  | `.claude/skills/kb-labs-create-product/` | "create a kb-labs service called X"         |
| Update platform | `.claude/skills/kb-labs-update/`         | "update kb-labs to latest"                  |
| Troubleshoot    | `.claude/skills/kb-labs-troubleshoot/`   | "kb-labs is not starting" / "kb-dev failed" |
| Explore         | `.claude/skills/kb-labs-explore/`        | "what plugins are installed?"               |
| Quickstart      | `.claude/skills/kb-labs-quickstart/`     | "is kb-labs working?"                       |

> Managed by `kb-create update` — do not edit by hand.

### Context skills (flat `.md`, auto-loaded by glob)

| Skill                      | Path                                   | Activates when                                                                           |
| -------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Task research (RAG)**    | `.claude/skills/task-rag.md`           | any implementation task                                                                  |
| **Testing strategy**       | `.claude/skills/testing.md`            | editing `**/*.test.ts`, `**/*.spec.ts`, `**/e2e/**`, `**/__tests__/**`, `**/commands/**` |
| Plugin development         | `.claude/skills/dev-plugin.md`         | editing `plugins/**`                                                                     |
| Core development           | `.claude/skills/dev-core.md`           | editing `core/**`, `sdk/**`                                                              |
| Monorepo patterns          | `.claude/skills/dev-monorepo.md`       | cross-package work                                                                       |
| **Workflow investigation** | `.claude/skills/workflow.md`           | editing `plugins/workflow/**`                                                            |
| **Quality plugin**         | `.claude/skills/quality.md`            | editing `plugins/quality/**` or architecture/coupling tasks                              |
| **ClickUp plugin**         | `.claude/skills/clickup.md`            | editing `plugins/clickup/**` or any clickup task                                         |
| Release pipeline           | `.claude/skills/tool-release.md`       | release / changelog tasks                                                                |
| kb-devkit usage            | `.claude/skills/tool-kb-devkit.md`     | build / task runner questions                                                            |
| kb-dev usage               | `.claude/skills/tool-kb-dev.md`        | service management                                                                       |
| **Isolated worktree stack** | `.claude/skills/worktree-isolated-stack.md` | running a full backend+studio stack for a worktree in parallel with main (`--net-offset`, redis/docker/AirPlay/studio port gotchas) |
| kb-deploy usage            | `.claude/skills/tool-kb-deploy.md`     | deploy tasks                                                                             |
| kb-monitor usage           | `.claude/skills/tool-kb-monitor.md`    | monitoring tasks                                                                         |
| **Docker build hygiene**   | `.claude/skills/docker-build-hygiene.md` | editing `**/Dockerfile*`, `**/docker-compose*.yml`, `e2e/deploy/**`, or running `docker build`/`run` |
| Code generation            | `.claude/skills/tool-generate.md`      | generate / scaffold tasks                                                                |
| Add new route              | `.claude/skills/new-route.md`          | adding HTTP routes                                                                       |
| Dependency hygiene         | `.claude/skills/deps-hygiene.md`       | dependency / lockfile tasks                                                              |
| Commit style               | `.claude/skills/commit.md`             | git commit messages                                                                      |
| Config mode switching      | `.claude/skills/config-mode.md`        | switching dev/prod config, `.kb/kb.config.json`                                          |
| Site voice                 | `.claude/skills/kb-labs-site-voice.md` | editing `sites/**`                                                                       |
| **Broken link checker**    | `.claude/skills/check-links.md`        | editing `sites/web/**`, broken links, `check-links.mjs`                                  |
| Aeza proxy                 | `.claude/skills/aeza-proxy.md`         | proxy / VPS tasks                                                                        |
| **Marketplace rehash**     | `.claude/skills/marketplace-rehash.md` | stale lock hashes, NoOp/MockLLM fallback, `.kb/marketplace.lock`, `adapters/**`          |

## Logging contract

All platform-backed processes use `IContextLogger` from `@kb-labs/core-platform`.
Create the root context only in the platform launcher; derive scopes with
`forComponent`, `forOperation`, and `forPlugin`. Do not construct correlation
metadata by hand and do not use `logger.child()` to replace platform identity.

Every platform record carries `applicationId`, `serviceId`, `instanceId`, and
`layer`. A request adds `requestId`, `traceId`, and optional `spanId`/`tenantId`.
Plugins inherit these values and can add `pluginId`, `pluginVersion`, and
`pluginKind`; parent identity always wins. Domain attributes are namespaced,
for example `http.method`, `http.route`, `workflow.run_id`, or `adapter.slot`.

Use levels consistently: `fatal` only when the process cannot continue;
`error` for failed operations; `warn` for a degraded actionable state; `info`
for one lifecycle/result summary; `debug` for technical steps (including HTTP
request start and route mounting); and `trace` for payload/transport detail.
HTTP completion is `info` only for meaningful business requests; health and
probe requests are `debug`. `KB_LOG_LEVEL=silent` suppresses all logs.

Use canonical lifecycle events (`platform.*`, `service.*`) through
`logger.event()`. Agent diagnostics are opt-in with `KB_DIAGNOSTICS=agent` and
must be structured, actionable, and free of secrets, tokens, raw environment,
or request payloads. See `docs/adr/0036-platform-log-context-contract.md`.

<!-- BEGIN: KB Labs v1.5.0 (managed by kb-create) - DO NOT EDIT -->

## KB Labs Platform

This project uses the [KB Labs](https://github.com/kb-labs-team/kb-labs) platform.
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
- `pnpm kb marketplace plugins list` — installed plugins
- `kb-create update` — update the platform
- `kb-create doctor` — verify the installation

### Where things live

- `.kb/kb.config.jsonc` — project configuration (safe to edit)
- `.kb/` — platform runtime state (do not edit by hand)
- `.claude/skills/kb-labs-*` — managed skills (reinstalled by `kb-create update`)

For full platform documentation see https://github.com/kb-labs-team/kb-labs.

<!-- END: KB Labs (managed) -->
