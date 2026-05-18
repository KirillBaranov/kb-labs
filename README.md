<p align="center">
  <strong>KB Labs</strong>
</p>

<p align="center">
  Automate engineering workflows. Extend AI agents safely. Control your infrastructure.
</p>

<p align="center">
  Open-source · Self-hosted · No cloud required
</p>

<p align="center">
  <a href="https://kblabs.ru" target="_blank">Website</a> ·
  <a href="https://docs.kblabs.ru" target="_blank">Docs</a> ·
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
  <img src="https://img.shields.io/badge/go-%3E%3D1.22-00ADD8.svg" alt="Go >= 1.22">
  <img src="https://img.shields.io/badge/pnpm-workspace-F69220.svg" alt="pnpm workspace">
</p>

<p align="center">
  <a href="https://github.com/KirillBaranov/kb-labs/actions/workflows/ci.yml?query=branch%3Amain"><img src="https://github.com/KirillBaranov/kb-labs/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <a href="https://github.com/KirillBaranov/kb-labs/actions/workflows/e2e-platform.yml?query=branch%3Amain"><img src="https://github.com/KirillBaranov/kb-labs/actions/workflows/e2e-platform.yml/badge.svg?branch=main" alt="E2E Platform"></a>
  <a href="https://github.com/KirillBaranov/kb-labs/actions/workflows/deploy.yml?query=branch%3Amain"><img src="https://github.com/KirillBaranov/kb-labs/actions/workflows/deploy.yml/badge.svg?branch=main" alt="Deploy"></a>
</p>

---

**KB Labs runs your engineering workflows.** Define once — run from CI, terminal, or on a schedule. Watch every step. Replace any infrastructure adapter without touching your code.

![Workflow running — github-issue-to-pr: agent reads the issue, plans implementation, creates a branch](docs/assets/workflow-in-progress.png)

*Agent executing `github-issue-to-pr`: fetched the issue, created a branch, now planning implementation — all observable in real time.*

![AI-powered commit generation: 6 commits across 23 files, typed and grouped automatically](docs/assets/commit-plugin-ui-example.png)

*Commit plugin groups your changes into typed commits with confidence scores. Review and apply in one click.*

![Release Manager: plan → changelog → preview → publish, 167 packages, 131 commits](docs/assets/release-manager-ui-example.png)

*Release Manager walks through the full cycle — plan, changelog, preview, publish — across the entire monorepo.*

---

## Install

```bash
curl -fsSL https://kblabs.ru/install.sh | sh
```

```bash
kb-create --demo     # install + demo on your codebase
kb-create --yes      # defaults, no wizard
```

Or install individual Go tools standalone — no Node.js required:

| Tool | What it does |
|------|-------------|
| [kb-devkit](tools/kb-devkit) | Monorepo builds — topological order, content-addressable cache |
| [kb-dev](tools/kb-dev) | Local service manager — start, stop, health probes |
| [kb-deploy](tools/kb-deploy) | Deploy to any VPS — Docker + registry, plus **declarative `apply`** for fleet rollouts ([guide](docs/guides/delivery.md)) |
| [kb-monitor](tools/kb-monitor) | Remote observability — health, logs, exec over SSH |

---

## What you get

- **Workflows** — define release pipelines, QA gates, agent pipelines in code. Run from CLI, CI, or Studio UI. Every run is logged and observable.
- **AI agents** — agents run as workflow steps with full isolation (in-process, worker-pool, or remote). Permissions declared, execution audited.
- **Adapter layer** — 25+ contracts for LLM, cache, storage, logging, and more. Swap DataDog for ClickHouse, OpenAI for any compatible model — one line in config, no application code changed.
- **Plugin system** — everything is a plugin. Ship your own commands, workflow steps, and agent tools. Install from the marketplace or build in-house.

---

## Extend internally — plugins

A plugin is a manifest + a handler. The platform discovers it, wires permissions, and exposes it as a CLI command, workflow step, or agent tool.

Don't give agents direct API access — encapsulate the logic in a plugin and expose only the commands they need.

```typescript
// plugins/clickup/entry/src/manifest.ts
import { combinePermissions } from '@kb-labs/sdk'

const permissions = combinePermissions()
  .withEnv(['CLICKUP_API_KEY', 'CLICKUP_TEAM_ID'])
  .withNetwork({ fetch: ['api.clickup.com'] })
  .withQuotas({ timeoutMs: 30000, memoryMb: 128 })
  .build()

export const manifest = {
  schema: 'kb.plugin/3',
  id: '@kb-labs/clickup',
  display: { name: 'ClickUp', description: 'Manage ClickUp tasks, lists, and comments from CLI and REST API' },
  permissions,
  cli: {
    commands: [
      {
        path: 'clickup workspace',
        describe: 'Show full workspace hierarchy (spaces → folders → lists)',
        handler: './commands/workspace.js#default',
        examples: ['kb clickup workspace', 'kb clickup workspace --json'],
      },
      {
        path: 'clickup task create',
        describe: 'Create a new task',
        handler: './commands/task-create.js#default',
        flags: [
          { name: 'list',     type: 'string', description: 'Target list ID (required)' },
          { name: 'name',     type: 'string', description: 'Task name (required)' },
          { name: 'priority', type: 'number', description: '1=urgent 2=high 3=normal 4=low' },
        ],
        examples: ['kb clickup task create --list abc123 --name "Fix login bug" --priority 2'],
      },
      {
        path: 'clickup task search',
        describe: 'Search tasks across the workspace',
        handler: './commands/task-search.js#default',
        flags: [
          { name: 'status', type: 'string', description: 'Filter by status (comma-separated)' },
          { name: 'limit',  type: 'number', description: 'Max results', default: 20 },
        ],
        examples: ['kb clickup task search "auth bug" --status "in progress" --json'],
      },
    ],
  },
}
```

```bash
# CLI commands auto-generated from the manifest
kb clickup workspace
kb clickup task create --list abc123 --name "Fix login bug" --priority 2
kb clickup task search "auth bug" --status "in progress"

# Same commands available as agent tools — no raw API access needed
```

→ [See the full ClickUp plugin source](https://github.com/KirillBaranov/kb-labs/tree/main/plugins/clickup)

---

## Connect externally — adapters

An adapter implements a platform interface. Swap implementations without touching application code.

```typescript
// adapters/logging-datadog/src/manifest.ts
import type { AdapterManifest } from '@kb-labs/core-platform'

export const manifest: AdapterManifest = {
  manifestVersion: '1.0.0',
  id: 'logging-datadog',
  name: 'Datadog Logger',
  version: '1.0.0',
  description: 'Datadog logging adapter',
  type: 'extension',
  implements: 'ILogger',
  configSchema: {
    apiKey: { type: 'string', description: 'Datadog API key' },
    service: { type: 'string', default: 'my-app' },
  }
}
```

```json
// .kb/kb.config.json
{
  "platform": {
    "adapters": {
      "logger": "@acme/adapters-logging-datadog"
    },
    "adapterOptions": {
      "logger": { "apiKey": "${DATADOG_API_KEY}", "service": "my-app" }
    }
  }
}
```

One line changed. No application code touched. The platform picks it up on next start.

---

## How KB Labs compares

**GitHub Actions** — great CI. Lives only in the pipeline. KB Labs runs the same scenarios locally, in Studio, on a schedule — and with agents as first-class steps inside any workflow.

**LangGraph** — graph orchestration for agents. Agents only, no engineering infrastructure around them. KB Labs gives agents isolation, permissions, and observability — and embeds them into workflows alongside your existing tooling.

**MCP servers** — a common way to extend agents like Claude Code with external tools. Works, but every server is a new process to maintain, and there's no permission boundary: if the API allows it, the agent can do it. KB Labs plugins are different. You decide exactly what the agent can call. No `task delete` in the manifest — the agent physically cannot delete, regardless of what the underlying API supports. Internal agents go further: sandboxed execution, declared resource quotas, full audit trail.

The ClickUp plugin in this repo is a real example: Claude Code uses `kb clickup task create` and `kb clickup task search` — it never touches the ClickUp API directly.

---

## How it works

```
  pnpm kb <cmd>  ──▶  CLI runtime
  browser        ──▶  Studio (:3000)
                           │
                  Gateway (:4000)   ← auth, routing
                    ├── REST API (:5050)
                    └── Workflow daemon (:7778)
                              │
                       Plugin runtime   ← sandbox + permissions
                         ├── your plugin handler
                         └── Adapter layer   ← LLM, cache, storage, …
```

CLI commands run **in-process** by default — no network hop, no Docker. Plugins call `useLLM()`, `useCache()`, `useStorage()` and the platform injects whichever adapter is configured in `kb.config.json`.

→ [Architecture overview](https://docs.kblabs.ru/concepts/overview) · [Plugin system](https://docs.kblabs.ru/concepts/plugin-system) · [Adapter system](https://docs.kblabs.ru/concepts/adapter-system)

---

## Architecture

```
core/        Types, runtime, config, plugin system   MIT
sdk/         Public API for plugin and adapter authors MIT
tools/       Go binaries                              MIT
─────────────────────────────────────────────────────────
plugins/     Automation: agents, workflow, gateway…  KB-Public
adapters/    Backends: OpenAI, Redis, Mongo, Docker… KB-Public
cli/         The kb command                          KB-Public
studio/      Web UI                                  KB-Public
```

Core defines interfaces. Adapters implement them. Plugins use them. Core never knows what's above it.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Command not found after building a plugin | `pnpm kb marketplace plugins refresh` |
| Service not starting — port already in use | `lsof -i :<port>` → `kill -9 <PID>` |
| 401 on every request | Check `gateway.staticTokens` in `kb.config.json`, or verify `GATEWAY_JWT_SECRET` didn't rotate |
| `useLLM()` returns undefined | Add `llm` adapter to `platform.adapters` in `kb.config.json` |
| Changes not showing up | Rebuild → clear cache → restart service → hard-reload browser (in that order) |

→ [Full troubleshooting guide](https://docs.kblabs.ru/guides/troubleshooting)

---

## Contributing

Issues and PRs are welcome. Check [open issues](https://github.com/KirillBaranov/kb-labs/issues) for good first contributions. For larger changes, open an issue first. Monorepo conventions in [CLAUDE.md](CLAUDE.md).

### CI state at a glance

The badges at the top of this README track main-branch status of each
workflow. For a terminal view:

```bash
./scripts/ci-status.sh           # latest run per workflow on main
./scripts/ci-status.sh 24h       # what ran in the last 24h + compute spend
./scripts/ci-status.sh 7d        # summary of the last 7 days
```

E2E Platform Tests and CI workflows have `paths-ignore` set: changes
that only touch `**/*.md`, `docs/**`, `sites/**` (for E2E only),
`.claude/**`, `.vscode/**`, or `.idea/**` skip those workflows. Skipped
runs do not appear in the Actions tab — they are simply not triggered.

Both workflows use `concurrency.cancel-in-progress`: pushing a new
commit while a previous run is still going cancels the older run.
Cancelled runs **do** appear in the Actions UI marked as "cancelled"
so nothing is silently dropped.

---

## License

| What | License |
|------|---------|
| `core/`, `sdk/`, `tools/` | [MIT](LICENSE-MIT) — use freely, including commercially |
| `plugins/`, `cli/`, `adapters/`, `studio/` | [KB-Public v1](LICENSE-KB-PUBLIC) — free for personal and internal use |

Selling hosted access? [Get in touch](https://kblabs.ru/enterprise).

---

<p align="center">
  Built by <a href="https://k-baranov.ru">Kirill Baranov</a>
</p>
