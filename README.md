<p align="center">
  <strong>KB Labs</strong>
</p>

<p align="center">
  Self-hosted platform for programmable dev workflows and vendor-free infrastructure.
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

---

## Extend internally — plugins

A plugin is a manifest + a handler. The platform discovers it, wires permissions, and exposes it as a CLI command, workflow step, or agent tool.

```typescript
// plugins/release/src/manifest.ts
import { combinePermissions, defineCommandFlags } from '@kb-labs/sdk'

export const manifest = {
  schema: 'kb.plugin/3',
  id: '@acme/release',
  display: { name: 'Release', description: 'Cut a release and notify the team' },
  cli: {
    commands: [{
      id: 'run',
      group: 'release',
      describe: 'Run the release pipeline',
      handler: './commands/run.js#default',
      permissions: combinePermissions()
        .withFs({ mode: 'read', allow: ['CHANGELOG.md', '.kb/**'] })
        .build(),
    }]
  }
}
```

```bash
kb release run
```

---

## Connect externally — adapters

An adapter implements a platform interface. Swap implementations without touching application code.

```typescript
// adapters/logging-datadog/src/index.ts  (@acme/adapters-logging-datadog)
import type { AdapterManifest, ILogger } from '@kb-labs/sdk/adapters'

export const manifest: AdapterManifest = {
  manifestVersion: '1.0.0',
  id: 'logging-datadog',
  name: 'Datadog Logger',
  version: '1.0.0',
  type: 'extension',
  implements: 'ILogger',
  configSchema: {
    apiKey: { type: 'string', description: 'Datadog API key' },
    service: { type: 'string', default: 'my-app' },
  }
}

export function createAdapter(options: { apiKey: string; service: string }): ILogger {
  return new DatadogLogger(options)
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
| Command not found after building a plugin | `pnpm kb marketplace clear-cache` |
| Service not starting — port already in use | `lsof -i :<port>` → `kill -9 <PID>` |
| 401 on every request | Check `gateway.staticTokens` in `kb.config.json`, or verify `GATEWAY_JWT_SECRET` didn't rotate |
| `useLLM()` returns undefined | Add `llm` adapter to `platform.adapters` in `kb.config.json` |
| Changes not showing up | Rebuild → clear cache → restart service → hard-reload browser (in that order) |

→ [Full troubleshooting guide](https://docs.kblabs.ru/guides/troubleshooting)

---

## Contributing

Issues and PRs are welcome. Check [open issues](https://github.com/KirillBaranov/kb-labs/issues) for good first contributions. For larger changes, open an issue first. Monorepo conventions in [CLAUDE.md](CLAUDE.md).

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
