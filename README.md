<p align="center">
  <strong>KB Labs</strong>
</p>

<p align="center">
  <a href="https://kblabs.ru/en" target="_blank">Website</a> ·
  <a href="https://twitter.com/kblabsdev" target="_blank">Twitter</a> ·
  <a href="https://discord.gg/kblabs" target="_blank">Discord</a>
</p>

<p align="center">
  <a href="https://github.com/KirillBaranov/kb-labs/blob/main/LICENSE-MIT">
    <img src="https://img.shields.io/badge/core-MIT-blue.svg" alt="Core: MIT">
  </a>
  <a href="https://github.com/KirillBaranov/kb-labs/blob/main/LICENSE-KB-PUBLIC">
    <img src="https://img.shields.io/badge/ecosystem-KB--Public-7C3AED.svg" alt="Ecosystem: KB-Public">
  </a>
  <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg" alt="Node >= 20">
  <img src="https://img.shields.io/badge/pnpm-%3E%3D9-orange.svg" alt="pnpm >= 9">
</p>

---

Google has Borg. Meta has Buck. Stripe has their internal dev platform.  
You have bash scripts and a growing list of SaaS subscriptions.

**KB Labs is the platform you were never supposed to have.**  
Self-hosted. Open source. Yours.

---

## What it is

A unified control plane for your dev infrastructure — CLI, workflow engine, plugin system, and an infrastructure gateway that ties it all together.

- **Workflows** — automate any multi-step process: CI, releases, code review, onboarding
- **Gateway** — wire your infrastructure once, use it everywhere. Plug in any adapter (LLM, storage, cache, DB) and every plugin speaks to it through a single interface. Or use `@kb-labs/platform-client` directly — same contracts, zero rewiring
- **Plugin System** — extend everything via SDK. If it has a manifest and uses the SDK, it's a plugin
- **CLI** — one `kb` command to run workflows, search code, manage plugins, and more
- **Studio** — web UI for monitoring workflows, services, and plugin state

No lock-in. No SaaS tax. Runs on your machine or your VPS.

---

## Quick Start

```bash
git clone https://github.com/KirillBaranov/kb-labs.git
cd kb-labs
pnpm install
pnpm build
pnpm dev:start    # starts gateway, workflow, rest-api, marketplace
pnpm kb --help
```

---

## Architecture

```
core/              Foundation: types, runtime, config, plugin system
sdk/               Public API for plugin authors
cli/               The `kb` command
shared/            Shared utilities
plugins/           Everything optional — AI agents, gateway, workflows, marketplace
adapters/          Pluggable backends (OpenAI, Redis, MongoDB, Qdrant, Docker...)
studio/            Web UI
tools/             Go binaries (kb-devkit, kb-dev, kb-deploy, kb-monitor)
```

Dependencies flow strictly downward: `core → sdk → plugins → studio`.  
Everything beyond core is a plugin. If it uses the SDK and has a manifest — it's a plugin.

---

## First-Party Plugins

| Plugin | What it does |
|--------|-------------|
| **mind** | RAG-powered semantic code search with embeddings and vector storage |
| **agents** | Autonomous AI agents with planning, tool use, and MCP |
| **workflow** | Multi-step workflow engine with daemon and job scheduling |
| **gateway** | Infrastructure gateway — adapters, routing, unified platform interface |
| **commit** | AI-powered conventional commit generation |
| **review** | Automated code review (heuristic + LLM) |
| **marketplace** | Install and manage plugins, adapters, workflows from registry |
| **release** | Release orchestration (versioning, changelogs, npm publish) |
| **quality** | Monorepo health checks and workspace scoring |

## Adapters

Swap backends without changing your code:

| Category | Available |
|----------|-----------|
| **LLM** | OpenAI, VibeProxy |
| **Analytics** | DuckDB, SQLite, File |
| **Logging** | Pino, SQLite, Ring Buffer |
| **Storage** | MongoDB, Redis, Qdrant |
| **Environment** | Docker |
| **Workspace** | LocalFS, Worktree, Agent |

---

## Toolchain

Four Go binaries. No Node.js required. Work standalone or as part of the platform.

| Tool | What it does |
|------|-------------|
| **[kb-devkit](tools/kb-devkit)** | Monorepo orchestrator — topological builds, content-addressable cache, workspace health |
| **[kb-dev](tools/kb-dev)** | Local service manager — start/stop/restart with health probes and dependency ordering |
| **[kb-deploy](tools/kb-deploy)** | Deploy to any VPS — affected-based, Docker + registry, no Kubernetes required |
| **[kb-monitor](tools/kb-monitor)** | Remote observability — logs, health checks, container exec over SSH |

Install `kb-dev` standalone:

```bash
curl -sf https://raw.githubusercontent.com/KirillBaranov/kb-labs/main/tools/kb-dev/install.sh | sh
```

Or use within the monorepo:

```bash
pnpm build              # topological build, cached
pnpm build:affected     # only changed packages + downstream
pnpm check              # build + lint + type-check + test

pnpm dev:start          # start all services
pnpm dev:status         # health table with latency
pnpm dev:logs workflow  # tail service logs

pnpm deploy             # deploy affected targets to VPS
pnpm deploy:status      # what's deployed and at which sha
pnpm monitor:health     # health check all remote services
```

---

## Contributing

```bash
git clone https://github.com/KirillBaranov/kb-labs.git
cd kb-labs
pnpm install
pnpm build
pnpm check
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## Requirements

- **Node.js** >= 20
- **pnpm** >= 9
- **Docker** (optional, for Qdrant, Redis, and environment isolation)
- macOS or Linux

## License

Core platform — [MIT](LICENSE-MIT)  
KB Labs ecosystem — [KB-Public License](LICENSE-KB-PUBLIC)

---

<p align="center">
  Built by <a href="https://github.com/KirillBaranov">Kirill Baranov</a>
</p>
