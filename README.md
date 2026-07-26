<h1 align="center">KB Labs</h1>

<p align="center">
  <strong>Open-source platform for developer automation.</strong>
  <br />
  Code review, commits, releases, and agent workflows — self-hosted and under your control.
</p>

<p align="center">
  <a href="https://kblabs.ru">Website</a> ·
  <a href="https://docs.kblabs.ru">Documentation</a> ·
  <a href="https://kblabs.ru/en/install">Install</a> ·
  <a href="https://kblabs.ru/en/changelog">Changelog</a> ·
  <a href="https://kblabs.ru/en/roadmap">Roadmap</a> ·
  <a href="https://discord.gg/kblabs">Discord</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@kb-labs/cli-bin?activeTab=versions"><img src="https://img.shields.io/npm/v/%40kb-labs%2Fcli-bin?label=stable" alt="Stable release"></a>
  <a href="https://www.npmjs.com/package/@kb-labs/cli-bin?activeTab=versions"><img src="https://img.shields.io/npm/v/%40kb-labs%2Fcli-bin/canary?label=canary" alt="Canary release"></a>
  <a href="https://github.com/kb-labs-team/kb-labs/actions/workflows/ci.yml?query=branch%3Amain"><img src="https://github.com/kb-labs-team/kb-labs/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <a href="https://github.com/kb-labs-team/kb-labs/actions/workflows/e2e-platform.yml?query=branch%3Amain"><img src="https://github.com/kb-labs-team/kb-labs/actions/workflows/e2e-platform.yml/badge.svg?branch=main" alt="Workflow E2E"></a>
  <a href="https://github.com/kb-labs-team/kb-labs/actions/workflows/security.yml?query=branch%3Amain"><img src="https://github.com/kb-labs-team/kb-labs/actions/workflows/security.yml/badge.svg?branch=main" alt="Security scan"></a>
</p>

<p align="center">
  Open source · Self-hosted · No cloud required
</p>

![A KB Labs workflow running in Studio, with every agent step visible in real time](docs/assets/workflow-in-progress.png)

KB Labs turns engineering operations into versioned, observable workflows. Define a
process once, run it from the terminal, CI, Studio, or a schedule, and keep humans,
agents, and bots behind the same permission model.

## Why KB Labs

| | |
|---|---|
| **Workflows, not scripts** | Releases, reviews, QA gates, and agent pipelines run on one engine with retries, approvals, logs, and artifacts. |
| **Agents with boundaries** | Plugins expose only the commands an agent is allowed to call. Secrets and raw vendor APIs stay behind the platform. |
| **Infrastructure without lock-in** | LLMs, databases, caches, storage, and observability providers sit behind typed adapter contracts. |
| **One operational surface** | Run locally or self-hosted. Inspect every step in Studio and use the same workflow from CLI or CI. |

KB Labs is built and operated with KB Labs: releases, review gates, QA, deployment,
and dependency workflows run on the same engine shipped in this repository.

## Quick start

Install the launcher:

```bash
curl -fsSL https://kblabs.ru/install.sh | sh
```

Then bootstrap a project or try the guided demo:

```bash
kb-create my-project
kb-create --demo
```

The launcher installs the required tools and generates a project configuration. See
the [installation guide](https://kblabs.ru/en/install) for supported platforms,
checksums, non-interactive setup, and individual tool downloads.

## Define once. Run anywhere.

Workflows are ordinary YAML files that live with your code:

```yaml
name: monorepo-health
version: 1.0.0

on:
  manual: true

jobs:
  health:
    runsOn: local
    steps:
      - name: Workspace stats
        run: kb-devkit stats
      - name: Type-check core
        run: pnpm --filter @kb-labs/core-types type-check
```

Run the same workflow locally, from CI, on a schedule, or through Studio. Larger
workflows can mix shell commands, plugin actions, AI agents, approval gates,
conditional routes, retries, and typed artifacts.

→ [Workflow documentation](https://docs.kblabs.ru/concepts/overview)

## The platform

| Capability | What it provides | Source |
|---|---|---|
| **Workflow engine** | Durable execution, schedules, approvals, gates, retries, artifacts | [`plugins/workflow`](plugins/workflow) |
| **Plugin runtime** | Discoverable commands with declared permissions and resource quotas | [`core/plugin-runtime`](core/plugin-runtime) |
| **Agent runtime** | Isolated agent execution with traceable tool access | [`plugins/agents`](plugins/agents) |
| **Adapter layer** | Typed contracts for LLM, cache, storage, logging, databases, and more | [`adapters`](adapters) |
| **Studio** | Visual workflow runs, logs, analytics, configuration, and operations | [`studio`](studio) |
| **Marketplace** | Installable plugins, adapters, and project capabilities | [`plugins/marketplace`](plugins/marketplace) |

### Plugins: give agents commands, not credentials

A plugin declares the operations it exposes and the permissions it needs. If a
destructive command is not in the manifest, the agent cannot call it — even when
the underlying vendor API supports it.

```typescript
import { combinePermissions } from '@kb-labs/sdk'

const permissions = combinePermissions()
  .withEnv(['CLICKUP_API_KEY'])
  .withNetwork({ fetch: ['api.clickup.com'] })
  .withQuotas({ timeoutMs: 30_000, memoryMb: 128 })
  .build()

export const manifest = {
  schema: 'kb.plugin/3',
  id: '@kb-labs/clickup',
  permissions,
  cli: {
    commands: [
      { path: 'clickup task search', handler: './commands/task-search.js#default' },
      { path: 'clickup task create', handler: './commands/task-create.js#default' },
    ],
  },
}
```

Those commands are available to people through the CLI and to agents as controlled
tools. The credential never enters the agent context.

→ [Plugin system](https://docs.kblabs.ru/concepts/plugin-system) ·
[ClickUp plugin source](plugins/clickup)

### Adapters: change the provider, not your code

Plugins depend on platform contracts such as `ILLM`, `ICache`, `IStorage`, and
`ILogger`. The configured adapter supplies the implementation:

```json
{
  "platform": {
    "adapters": {
      "llm": "@kb-labs/adapters-openai",
      "cache": "@kb-labs/adapters-redis",
      "logger": "@kb-labs/adapters-pino"
    }
  }
}
```

Swap OpenAI for another compatible LLM provider, Redis for an in-memory cache, or
Pino for another logger without rewriting plugin business logic.

→ [Adapter system](https://docs.kblabs.ru/concepts/adapter-system)

## Security

If you believe you have found a vulnerability, please **do not open a public
issue**. Read our [Security Policy](SECURITY.md) for scope, reporting instructions,
response timelines, and the responsible disclosure process.

## See it in action

<p>
  <img width="49%" src="docs/assets/commit-plugin-ui-example.png" alt="Commit plugin grouping changes into reviewable conventional commits">
  <img width="49%" src="docs/assets/release-manager-ui-example.png" alt="Release Manager planning and publishing a monorepo release">
</p>

The Commit plugin groups changes into typed, reviewable commits. Release Manager
plans versions and changelogs across the monorepo, then previews exactly what will
be published.

More product walkthroughs and live examples are available on the
[website](https://kblabs.ru/en/demo) and in the
[documentation](https://docs.kblabs.ru).

## How it works

```text
Terminal / CI / Schedule / Studio
                 │
          Workflow engine
        ┌────────┼────────┐
   shell step  plugin   AI agent
                 │        │
          permission boundary
                 │
        typed platform contracts
                 │
     LLM · cache · storage · logs
```

CLI commands run in-process by default, without a network hop or Docker. Services
can be started together for Studio, shared APIs, scheduled workflows, and remote
execution.

→ [Architecture overview](https://docs.kblabs.ru/concepts/overview)

## How it compares

| | Best at | Where KB Labs differs |
|---|---|---|
| **GitHub Actions** | Repository CI/CD | KB Labs runs the same workflow locally, in Studio, from CI, or on a schedule, with agents and approvals as first-class steps. |
| **Agent frameworks** | Building agent graphs | KB Labs adds engineering workflows, operational visibility, plugin permissions, and swappable infrastructure adapters. |
| **MCP servers** | Giving agents external tools | KB Labs plugins expose a deliberately restricted command surface and keep credentials, quotas, and audit inside the platform. |

KB Labs can sit beside your existing CI and agent stack. Adoption starts with one
workflow; no platform migration is required.

## Standalone tools

The Go tools can also be installed and used independently — no Node.js runtime
required:

| Tool | Purpose |
|---|---|
| [`kb-devkit`](tools/kb-devkit) | Topological monorepo builds with content-addressable caching |
| [`kb-dev`](tools/kb-dev) | Local service lifecycle, health checks, and logs |
| [`kb-deploy`](tools/kb-deploy) | Docker and registry deployment to your own infrastructure |
| [`kb-monitor`](tools/kb-monitor) | Remote health, logs, and command execution over SSH |

## Project status

Operational signals live here so the product header stays focused:

| Signal | Status |
|---|---|
| Production and documentation | [![Deploy](https://github.com/kb-labs-team/kb-labs/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/kb-labs-team/kb-labs/actions/workflows/deploy.yml?query=branch%3Amain) |
| Main branch | [![CI](https://github.com/kb-labs-team/kb-labs/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/kb-labs-team/kb-labs/actions/workflows/ci.yml?query=branch%3Amain) |
| Platform E2E | [![E2E Platform](https://github.com/kb-labs-team/kb-labs/actions/workflows/e2e-platform.yml/badge.svg?branch=main)](https://github.com/kb-labs-team/kb-labs/actions/workflows/e2e-platform.yml?query=branch%3Amain) |
| Daily security scan | [![Security scan](https://github.com/kb-labs-team/kb-labs/actions/workflows/security.yml/badge.svg?branch=main)](https://github.com/kb-labs-team/kb-labs/actions/workflows/security.yml?query=branch%3Amain) |

Node.js packages require Node 20 or newer; CI currently runs on Node 22. Go tools
carry their required toolchain version in their respective `go.mod` files.

For a terminal view of CI activity and compute usage:

```bash
./scripts/ci-status.sh
./scripts/ci-status.sh 24h
./scripts/ci-status.sh 7d
```

See the [CI/CD reference](docs/ci-cd.md) for triggers, gates, and troubleshooting.

## Contributing

Issues and pull requests are welcome. Start with
[open issues](https://github.com/kb-labs-team/kb-labs/issues), and open an issue
before proposing a large architectural change.

```bash
pnpm install
pnpm build
pnpm check
kb-dev start
```

Repository conventions are documented in [`AGENTS.md`](AGENTS.md). Architecture
decisions live in [`docs/adr`](docs/adr).

## License

| Code | License |
|---|---|
| `core/`, `sdk/`, `tools/` | [MIT](LICENSE-MIT) — free for commercial use |
| `plugins/`, `cli/`, `adapters/`, `studio/` | [KB-Public v1](LICENSE-KB-PUBLIC) — free for personal and internal use |

For hosted resale or commercial licensing, [get in touch](https://kblabs.ru/enterprise).

<p align="center">
  Built by <a href="https://k-baranov.ru">Kirill Baranov</a>
</p>
