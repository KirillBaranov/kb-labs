---
name: tool-kb-dev
description: kb-dev Go service manager — start/stop/status/logs for local development services
globs:
  - "tools/kb-dev/**"
  - "**/devservices.yaml"
  - ".kb/devservices.yaml"
---

# kb-dev — Service Manager

Go binary that manages local development services with process tracking, health checks, dependency ordering, and auto-restart.

## Commands

```bash
kb-dev start                 # start all services (dependency-aware parallel)
kb-dev start rest gateway    # start specific services
kb-dev start backend         # start a group
kb-dev stop                  # stop all
kb-dev stop workflow         # stop specific
kb-dev restart               # restart all
kb-dev status                # health + CPU% + memory per service
kb-dev status --json         # agent-friendly JSON output
kb-dev health                # quick health check
kb-dev logs                  # tail all logs
kb-dev logs workflow         # tail specific service
kb-dev watch                 # JSONL streaming events
kb-dev doctor                # environment diagnostics
```

## Multi-project registry (`register` / `switch` / `projects`)

For machines with several local KB Labs projects sharing one platform install
(`~/kb-platform`), `kb-dev` keeps a small alias→path registry inside the
platform's `~/kb-platform/.kb/kb.config.jsonc` (`"projects"` section), so you
can jump between projects from anywhere without `cd`-ing first.

```bash
kb-dev register my-project              # register CWD under an alias
kb-dev register my-project ~/code/proj  # register an explicit path
kb-dev unregister my-project            # remove an alias

kb-dev projects                         # list registered projects + running state
kb-dev projects --prune                 # stop every registered project that's running

kb-dev switch my-project                # stop other registered projects, start this one
kb-dev switch my-project --keep-others  # start this one without stopping others
```

`switch` resolves each project's TCP ports via a deterministic offset derived
from its alias (`internal/netoffset.DeriveOffset` + a bind-probe that steps
past anything actually occupied), so two registered projects never collide on
ports even without `--net-offset`. The resolved offset is cached per project
under `.kb/tmp/net-offset.json` so it stays stable across restarts.

`switch` always verifies a stop actually succeeded (via `Reconcile`) before
starting the target — it refuses to pile a second instance on top of a
project that failed to release its ports, rather than silently leaking
processes.

Platform directory resolution (for commands run outside any project, e.g.
`kb-dev switch` from your home directory): `--platform-dir` flag > current
project's `platform.dir` > `~/.kb/active-platform` (written by `kb-create`
on install/update).

Process state (PID files, lock, logs, offset cache) is namespaced per project
whenever a platform is shared across multiple registered projects (their
`rootDir` — where `devservices.yaml` lives — is otherwise identical), so two
projects never see each other's PID files. Single-project setups (project ==
platform dir) are unaffected — same layout as always.

### Auto-switch on `cd` (opt-in, off by default)

Add `"devSwitch": { "autoHook": true }` to a **project's own**
`.kb/kb.config.json` (not the platform config) to have `cd`-ing into that
project automatically `switch` to it — only for projects that opt in, and
only once you install the shell hook yourself:

```bash
kb-dev hook zsh   # prints a snippet — paste it into ~/.zshrc yourself
kb-dev hook bash  # same, for ~/.bashrc
```

`kb-dev` never edits your rc files. The printed snippet runs `kb-dev
hook-check` in the background on every `cd`; it no-ops instantly unless the
target directory is a registered project with `autoHook: true` and isn't
already the active one.

## Dev Config (`devservices.dev.yaml`)

Проект имеет **два конфига**:
- `.kb/devservices.yaml` — продакшн/базовые сервисы (используется по умолчанию)
- `.kb/devservices.dev.yaml` — dev-расширение: добавляет studio, qdrant, redis, kb-web, kb-docs, host-agent, runtime-server

Переключиться через `--config`:

```bash
kb-dev start --config .kb/devservices.dev.yaml          # запустить всё из dev конфига
kb-dev start studio --config .kb/devservices.dev.yaml   # только студия
kb-dev start --group backend --config .kb/devservices.dev.yaml  # только backend группа
kb-dev status --config .kb/devservices.dev.yaml
kb-dev stop --config .kb/devservices.dev.yaml
```

### npm scripts (удобные алиасы)

```bash
pnpm dev:start              # все сервисы (базовый devservices.yaml)
pnpm dev:start:dev          # все сервисы через devservices.dev.yaml
pnpm dev:start:studio       # только студия через devservices.dev.yaml
pnpm dev:start:backend      # только backend группа через devservices.dev.yaml
pnpm dev:status             # статус (базовый)
pnpm dev:status:dev         # статус через devservices.dev.yaml
pnpm dev:stop               # остановить (базовый)
pnpm dev:stop:dev           # остановить через devservices.dev.yaml
pnpm dev:logs               # логи
pnpm dev:restart            # рестарт
```

### Группы в devservices.dev.yaml

| Группа | Сервисы |
|--------|---------|
| `infra` | qdrant, redis, state-daemon |
| `backend` | workflow, rest, marketplace, gateway |
| `ui` | studio |
| `ui-web` | kb-web, kb-docs |
| `local` | host-agent |
| `execution` | runtime-server |

### Порты (dev)

| Сервис | Порт |
|--------|------|
| gateway | 4000 |
| rest | 5050 |
| marketplace | 5070 |
| state-daemon | 7777 |
| workflow | 7778 |
| studio | 3000 |
| kb-web | 3010 |
| kb-docs | 3001 |
| qdrant | 6333 |
| redis | 6379 |

## Configuration

Config is auto-discovered:
1. `.kb/devservices.yaml` (KB Labs project)
2. `devservices.yaml` (any project)

### devservices.yaml structure

```yaml
name: kb-labs

groups:
  infra:   [qdrant, state]
  backend: [rest, gateway, workflow, marketplace]

services:
  gateway:
    command: node ./plugins/gateway/server/dist/index.js
    port: 4000
    health_check: http://localhost:4000/health
    depends_on: []

  rest:
    command: node ./plugins/rest-api/core/dist/index.js
    port: 5050
    health_check: http://localhost:5050/health
    depends_on: [gateway]

  workflow:
    command: node ./plugins/workflow/daemon/dist/index.js
    port: 7778
    health_check: http://localhost:7778/health
    depends_on: [gateway]
```

## Key Features

- **Process groups** — real PID tracking via `Setpgid`
- **Health probes** — HTTP, TCP, and command probes with latency
- **Dependency-aware start** — topological sort, goroutine per service
- **Auto-restart** — watchdog with exponential backoff (1s → 30s, max 5)
- **Cross-process locking** — `flock` prevents duplicate instances
- **Agent JSON protocol** — `ok` field, `hint` commands, `depsState`, `logsTail`
- **Docker/Colima** — auto-detect and start Docker runtime on macOS

## Environment Variables

Supports `${VAR}` substitution in any string field:
1. Process environment (highest priority)
2. `.env` file in project root

## Important

- **Never use `node ./path` to start services** — always `kb-dev start`
- **Never change ports in `devservices.yaml`** — fix the scripts instead
- Logs are stored in `.kb/logs/tmp/`
- PID files in `.kb/tmp/`
