<p align="center">
  <strong>KB Labs</strong><br>
  Open-source AI & infrastructure control plane for developers.
</p>

<p align="center">
  <a href="https://github.com/KirillBaranov/kb-labs/blob/main/LICENSE-MIT">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT">
  </a>
  <a href="https://github.com/KirillBaranov/kb-labs/blob/main/LICENSE-KB-PUBLIC">
    <img src="https://img.shields.io/badge/license-KB--Public-7C3AED.svg" alt="License: KB-Public">
  </a>
  <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg" alt="Node >= 20">
  <img src="https://img.shields.io/badge/pnpm-%3E%3D9-orange.svg" alt="pnpm >= 9">
</p>

---

## What is KB Labs?

KB Labs is an **extensible platform** that gives you a unified CLI, plugin system, workflow engine, and AI gateway — all self-hosted, all open.

Instead of stitching together scripts, bots, and SaaS tools, you get one coherent system where everything works together:

- **Workflows** — automate any multi-step process (CI, releases, code review, onboarding)
- **AI Gateway** — route LLM calls through a single endpoint with cost tracking, caching, and fallbacks
- **Plugin System** — extend everything via a simple SDK (`useCache`, `useLLM`, `useLogger`)
- **CLI** — one `kb` command to run workflows, search code, manage plugins, and more
- **Studio** — web UI for monitoring workflows, services, and plugin state

## Who is it for?

- **Developers** tired of gluing together 10 tools that don't talk to each other
- **Tech leads** who want a single control plane for their team's dev infrastructure
- **Solo founders** building AI-powered products who need solid infra without the SaaS tax

## Quick Start

```bash
# Clone and install
git clone https://github.com/KirillBaranov/kb-labs.git
cd kb-labs
pnpm install

# Build all packages
pnpm build

# Start services (gateway, rest-api, workflow, etc.)
pnpm dev:start

# Check everything is running
pnpm dev:status

# Try the CLI
pnpm kb --help
```

That's it. No submodules, no special tooling, no 15-minute setup.

## Architecture

```
core/              Foundation: types, runtime, config, plugin system
sdk/               Public API for plugin authors
cli/               The `kb` command
shared/            Shared utilities (CLI UI, HTTP helpers, testing)
plugins/           Everything optional — from AI agents to the API gateway
adapters/          Pluggable backends (OpenAI, Redis, MongoDB, Qdrant, Docker...)
studio/            Web UI
tools/             Go binaries (kb-devkit, kb-dev, kb-create)
```

### How it fits together

```
You (CLI / Studio / API)
  │
  ├── Gateway (:4000)        → auth, routing, LLM proxy
  ├── REST API (:5050)       → platform API
  ├── Workflow (:7778)       → run multi-step automations
  ├── Marketplace (:5070)    → install plugins, adapters, workflows
  └── State (:7777)          → distributed state management

  All services are optional. Start with just the CLI.
```

### Plugin System

Everything beyond core is a **plugin**. If it uses the SDK, registers commands, and has a manifest — it's a plugin. Whether it also runs an HTTP server is an implementation detail.

```
Level 1: CLI only         → core + sdk + cli + plugins (no servers needed)
Level 2: + Gateway        → add auth, routing, LLM proxy
Level 3: + Services       → add workflow, marketplace, rest-api (pick what you need)
```

## First-Party Plugins

| Plugin | What it does |
|--------|-------------|
| **mind** | RAG-powered semantic code search with embeddings and vector storage |
| **agents** | Autonomous AI agents with planning, tool use, and MCP |
| **workflow** | Multi-step workflow engine with daemon and job scheduling |
| **commit** | AI-powered conventional commit generation |
| **review** | Automated code review (heuristic + LLM) |
| **gateway** | API gateway — auth, routing, LLM proxy |
| **marketplace** | Install and manage plugins, adapters, workflows from registry |
| **release** | Release orchestration (versioning, changelogs, npm publish) |
| **quality** | Monorepo health checks and workspace scoring |

## Adapters

Adapters are pluggable backends. Swap them without changing your code:

| Category | Available |
|----------|-----------|
| **LLM** | OpenAI, VibeProxy |
| **Analytics** | DuckDB, SQLite, File |
| **Logging** | Pino, SQLite, Ring Buffer |
| **Storage** | MongoDB, Redis, Qdrant |
| **Environment** | Docker |
| **Workspace** | LocalFS, Worktree, Agent |

## Tooling

KB Labs ships with two Go binaries that work independently of the Node.js platform:

### kb-devkit — Build Orchestrator

Content-addressable build caching, topological execution, workspace health scoring.

```bash
pnpm build                    # build all (cached, <1s if nothing changed)
pnpm build:affected           # only changed packages + downstream
pnpm check                    # build + lint + type-check + test
pnpm health                   # workspace health score (A–F)
```

### kb-dev — Service Manager

Process management with health probes, dependency ordering, auto-restart.

```bash
pnpm dev:start                # start all services
pnpm dev:start backend        # start a group
pnpm dev:status               # health table with latency
pnpm dev:logs workflow        # tail service logs
```

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup

```bash
git clone https://github.com/KirillBaranov/kb-labs.git
cd kb-labs
pnpm install          # one command, ~20 seconds
pnpm build            # build everything
pnpm check            # verify lint + types + tests pass
```

### Useful Commands

```bash
# Work on a specific package
pnpm --filter @kb-labs/mind-engine test
pnpm --filter @kb-labs/core-types type-check

# Build only what changed
pnpm build:affected

# Check workspace health
pnpm ws:check         # lint all packages against conventions
pnpm ws:fix           # auto-fix safe violations

# Search code semantically (requires Mind plugin + Qdrant)
pnpm kb mind rag-query --text "how does plugin loading work"
```

### Project Structure

Every plugin follows the same pattern:

```
plugins/your-plugin/
├── entry/          # manifest + CLI commands + Studio pages (thin wiring)
├── contracts/      # types only, zero runtime deps
├── core/           # business logic
├── daemon/         # (optional) HTTP service
└── docs/adr/       # architecture decision records
```

Dependencies flow strictly downward: `core → sdk → plugins → studio`.

## Documentation

- [CLAUDE.md](CLAUDE.md) — full platform context (for AI assistants and deep dives)
- [CONTRIBUTING.md](CONTRIBUTING.md) — contribution guidelines
- [docs/adr/](docs/adr/) — cross-cutting architecture decisions
- Each module has its own `docs/adr/` for module-specific decisions

## Requirements

- **Node.js** >= 20
- **pnpm** >= 9
- **Docker** (optional, for Qdrant and Redis)
- macOS or Linux

## License

Core platform — [MIT](LICENSE-MIT)
KB Labs ecosystem — [KB-Public License](LICENSE-KB-PUBLIC)
See [LICENSE-SUMMARY.md](LICENSE-SUMMARY.md) for details.

---

<p align="center">
  Built by <a href="https://github.com/KirillBaranov">Kirill Baranov</a>
</p>
