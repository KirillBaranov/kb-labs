# kb-dev

**Local service manager — works with any project, built for KB Labs.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Go](https://img.shields.io/badge/Go-1.24+-00ADD8.svg)](https://go.dev)
[![KB Labs](https://img.shields.io/badge/KB_Labs-platform-7C3AED.svg)](https://github.com/KirillBaranov)

kb-dev manages local development services with proper process tracking, health checks, dependency ordering, and auto-restart. It replaces hand-rolled `Makefile` / `dev.sh` scripts with a single Go binary that works in any project.

## Features

- ✅ **Process group management** — real PID tracking via `Setpgid`, no lsof guessing
- ✅ **Health probes with latency** — HTTP, TCP, and command probes with response time tracking
- ✅ **Dependency-aware parallel start** — topological sort, goroutine per service
- ✅ **Auto-restart on crash** — watchdog with exponential backoff (1s → 30s, max 5 retries)
- ✅ **Rich PID files** — JSON with user, timestamp, command (not bare numbers)
- ✅ **Environment resolution** — cached node/pnpm paths, no login shell dependency
- ✅ **Agent-first JSON protocol** — `ok` field, `hint` commands, `depsState`, `logsTail`
- ✅ **Resource monitoring** — CPU% and memory per service via `status`
- ✅ **Cross-process locking** — `flock` prevents concurrent kb-dev instances from duplicating services
- ✅ **JSONL streaming** — real-time event monitoring via `watch`
- ✅ **Docker/Colima** — auto-detect and start Docker runtime on macOS

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/KirillBaranov/kb-labs-dev/main/install.sh | sh
```

Or pin a version:

```bash
curl -fsSL https://raw.githubusercontent.com/KirillBaranov/kb-labs-dev/main/install.sh | sh -s -- --version v1.2.3
```

Or build from source:

```bash
git clone https://github.com/KirillBaranov/kb-labs-dev
cd kb-labs-dev
make build
```

## Quick Start

```bash
# 1. Create devservices.yaml in your project root
cat > devservices.yaml << 'EOF'
name: my-project

services:
  postgres:
    command: docker run --rm -p 5432:5432 -e POSTGRES_PASSWORD=dev postgres:16
    type: docker
    port: 5432
    health_check: http://localhost:5432

  api:
    command: pnpm dev
    port: 3000
    health_check: http://localhost:3000/health
    depends_on: [postgres]
EOF

# 2. Start everything
kb-dev start

# 3. Check status
kb-dev status

# 4. Tear down
kb-dev stop
```

## Configuration

kb-dev discovers config by walking up from the current directory. It checks these locations in order:

| Location | Used when |
|----------|-----------|
| `.kb/devservices.yaml` | KB Labs project (platform-native) |
| `devservices.yaml` | Any project (standalone) |
| `devservices.yml` | Any project (standalone, alt extension) |

You can also pass an explicit path: `kb-dev --config path/to/devservices.yaml start`

### devservices.yaml reference

```yaml
name: my-project

# Optional: declare groups for bulk operations (kb-dev start infra)
# If omitted, groups are inferred from service.group fields
groups:
  infra:   [postgres, redis]
  backend: [api, worker]

services:
  postgres:
    name: PostgreSQL              # display name (optional, defaults to key)
    description: Primary database # optional
    group: infra                  # optional, used to infer groups map
    type: docker                  # "node" (default) | "docker"
    command: docker run --rm -p 5432:5432 postgres:16
    stop_command: docker stop postgres  # optional, for docker services
    container: postgres           # container name to track (docker only)
    health_check: http://localhost:5432  # HTTP URL, TCP addr, or shell command
    port: 5432
    url: http://localhost:5432    # display URL in status table
    depends_on: [redis]           # start order + cascade stop
    optional: true                # don't fail startup if this service fails
    note: "Needs 'docker login' first"  # shown in status output
    env:
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: myapp
    api:                          # informational only — not used for routing
      docs: http://localhost:5432/docs
      endpoints:
        - GET /health

# Optional: override runtime directories and timeouts
settings:
  logs_dir: .kb/logs/tmp              # default
  pid_dir: .kb/tmp                    # default
  start_timeout_ms: 30000             # default
  health_check_interval_ms: 1000      # default
```

### Environment variables

Any string field in `devservices.yaml` supports `${VAR}` substitution:

```yaml
services:
  postgres:
    command: docker run --rm -p 5432:5432 -e POSTGRES_PASSWORD=${DB_PASSWORD} postgres:16
    type: docker
    port: 5432
    health_check: http://localhost:5432

  api:
    command: node dist/index.js
    port: 3000
    url: http://localhost:3000
    env:
      DATABASE_URL: ${DATABASE_URL}
      API_KEY: ${API_KEY}
      PORT: "3000"        # literal — no substitution needed
```

Variables are resolved from two sources, in priority order:

1. **Process environment** (`export VAR=value` / shell env / CI secrets)
2. **`.env` file** in the project root (silently skipped if missing)

Process env always wins over `.env`. If a referenced variable is not found in either source, startup fails with a clear error:

```
env expansion: service "api": environment variable "API_KEY" is not set
```

**.env file format:**

```bash
# .env — never commit secrets
DATABASE_URL=postgres://localhost/myapp
DB_PASSWORD=dev
API_KEY="my secret key"   # quotes are stripped
```

Comments (`#`), blank lines, and quoted values are all supported.

### Service types

**`node`** (default) — spawned directly by kb-dev. PID is tracked from `cmd.Start()`.

```yaml
api:
  type: node
  command: node dist/index.js
```

**`docker`** — started via shell command. Health is checked via the configured probe.

```yaml
postgres:
  type: docker
  command: docker-compose up -d postgres
  stop_command: docker-compose stop postgres
  container: postgres
```

## Commands

### Core

| Command | Description |
|---------|-------------|
| `kb-dev start [target]` | Start services with dependency resolution |
| `kb-dev stop [target]` | Stop services (optionally cascade dependents) |
| `kb-dev restart [target]` | Restart with dependent cascade |
| `kb-dev status` | Service status table with latency |
| `kb-dev health` | Run health probes on all services |
| `kb-dev logs <service>` | View service logs (with `--follow`) |
| `kb-dev doctor` | Environment diagnostics |

### Agent-friendly

| Command | Description |
|---------|-------------|
| `kb-dev ensure <targets...>` | Idempotent desired state (alive→skip, dead→start, failed→restart) |
| `kb-dev ready <targets...>` | Block until all services are alive |
| `kb-dev watch` | Stream lifecycle events as JSONL |

### Flags

| Flag | Description |
|------|-------------|
| `--json` | Structured JSON output (all commands) |
| `--force` | Kill port conflicts before starting |
| `--cascade` | Stop/restart dependent services too |
| `--no-cascade` | Skip dependent cascade on restart |
| `--config <path>` | Explicit config file path |

### Start

```bash
kb-dev start                    # all services
kb-dev start infra              # group
kb-dev start api                # single service (with deps)
kb-dev start --force            # kill port conflicts first
kb-dev start --watch            # stay alive, auto-restart on crash
```

### Status

```bash
kb-dev status
kb-dev status --json
```

```
my-project

  [infra]
  ● postgres            5432    alive       http://localhost:5432  4m    3ms
  ● redis               6379    alive                              4m    1ms

  [backend]
  ● api                 3000    alive       http://localhost:3000  3m    12ms
  ○ worker                      dead

  3 alive  1 dead  (4 total)
```

### Ensure (agent-friendly)

```bash
kb-dev ensure api worker --json
```

```json
{
  "ok": true,
  "actions": [
    {"service": "postgres", "action": "skipped", "reason": "already alive"},
    {"service": "api",      "action": "skipped", "reason": "already alive"},
    {"service": "worker",   "action": "started", "elapsed": "1.2s"}
  ]
}
```

### Doctor

```bash
kb-dev doctor --json
```

```json
{
  "ok": false,
  "checks": [
    {"id": "config", "ok": true,  "detail": "4 services, 2 groups"},
    {"id": "docker", "ok": true,  "detail": "Docker 28.4.0"},
    {"id": "node",   "ok": true,  "detail": "v22.0.0"},
    {"id": "port:3000", "ok": false, "detail": "occupied (PID 1234), needed by api"}
  ],
  "hint": "Port 3000 occupied. Fix: kb-dev stop api --force"
}
```

### Watch (JSONL)

```bash
kb-dev watch --json
```

```
{"event":"health",     "service":"api","ok":true, "latency":"12ms","ts":"..."}
{"event":"crashed",    "service":"api","exitCode":1,"logsTail":["Error: ..."],"ts":"..."}
{"event":"restarting", "service":"api","attempt":1,"backoff":"1s","ts":"..."}
{"event":"alive",      "service":"api","latency":"15ms","ts":"..."}
```

## Agent Protocol

Every JSON response follows a consistent contract:

| Field | Type | When | Description |
|-------|------|------|-------------|
| `ok` | bool | always | Operation succeeded |
| `hint` | string | on failure | Exact command to fix the issue |
| `actions` | array | on mutations | What was done per service |
| `logsTail` | array | on failure | Last 5 log lines |
| `depsState` | map | in status | Dependency states at a glance |

**Agent workflow:**
```bash
kb-dev doctor --json          # 1. diagnose environment
kb-dev ensure api --json      # 2. bring up what I need (idempotent)
kb-dev ready api --json       # 3. block until alive
# ... do work ...
kb-dev status --json          # 4. verify final state
```

## How It Works

```
                 ┌──────────────────────┐
                 │   devservices.yaml   │  .kb/devservices.yaml  (KB Labs)
                 │                      │  devservices.yaml      (standalone)
                 └──────────┬───────────┘
                            │
                 ┌──────────▼───────────┐
                 │    Config / Loader   │  Discover, parse, validate, toposort
                 └──────────┬───────────┘
                            │
           ┌────────────────┼────────────────┐
           ▼                ▼                ▼
     ┌──────────┐     ┌──────────┐     ┌──────────┐
     │ Environ  │     │  Health  │     │  Docker  │
     │ Resolve  │     │  Probes  │     │  Colima  │
     └────┬─────┘     └────┬─────┘     └────┬─────┘
          │                │                │
          └────────────────┼────────────────┘
                           ▼
                  ┌─────────────────┐
                  │    Manager      │  Start/Stop/Ensure/Ready/Watch
                  │                 │  Dependency graph, parallel layers
                  └────────┬────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
     ┌──────────┐    ┌──────────┐    ┌──────────┐
     │ Process  │    │ Service  │    │ Watchdog │
     │  Spawn   │    │  State   │    │  Auto-   │
     │ + Kill   │    │ Machine  │    │ restart  │
     └──────────┘    └──────────┘    └──────────┘
```

**PID-first:** kb-dev knows the PID because it spawned the process. No `lsof` guessing — port checks are only used for `--force` and `doctor`.

**State machine per service:** `dead` → `starting` → `alive` | `failed` → `stopping` → `dead`.

## Architecture

```
kb-labs-dev/
├── main.go                         entry point (build-time version injection)
├── cmd/
│   ├── root.go                     cobra root, global flags, config discovery
│   ├── start.go                    start command
│   ├── stop.go                     stop command
│   ├── restart.go                  restart command
│   ├── status.go                   status table (human + JSON)
│   ├── health_cmd.go               health probe report
│   ├── logs.go                     log viewer (tail + follow)
│   ├── doctor.go                   environment diagnostics
│   ├── ensure.go                   idempotent desired state
│   ├── ready.go                    blocking readiness gate
│   ├── watch.go                    JSONL event streaming
│   ├── helpers.go                  shared loadManager, errSilent
│   └── output.go                   lipgloss formatting
└── internal/
    ├── config/                     discover + parse devservices.yaml, toposort, validation
    │   ├── config.go               Config/Service types, query methods
    │   ├── loader.go               Discover(), LoadFile(), RootDir()
    │   ├── yaml.go                 devservices.yaml parser → Config
    │   └── defaults.go             applyDefaults(), validate()
    ├── environ/                    resolve node/pnpm paths, env cache
    ├── health/                     HTTP/TCP/Command probes + latency
    ├── process/                    spawn (Setpgid), kill (group), rich PID files
    ├── service/                    state machine, ServiceRunner interface
    ├── manager/                    orchestration, deps, watchdog, events
    ├── docker/                     Docker availability, Colima auto-start
    └── logger/                     per-service log files, tail, follow
```

### Extension Points

| Point | How to Extend |
|-------|--------------|
| New service runner | Implement `service.Runner` interface (e.g. `DockerComposeRunner`, `RemoteRunner`) |
| New health probe | Add probe type in `health/probe.go`, extend `ClassifyProbe` |
| New CLI command | Add `cmd/<name>.go` with cobra command, register in `init()` |
| Config migration | Bump config version, add migration logic in `loader.go` |
| Remote API | Wrap `Manager` methods in HTTP handlers (same JSON schema) |

## Development

```bash
# Prerequisites: Go 1.24+, golangci-lint

make build      # build for current platform
make test       # run tests with race detector
make lint       # golangci-lint
make cover      # coverage report (opens coverage.html)
make snapshot   # cross-platform build via goreleaser
```

## Comparison

| Aspect | Makefile / dev.sh | kb-dev |
|--------|-------------------|--------|
| Process tracking | `lsof` port check | PID from `cmd.Start()` |
| Kill mechanism | Recursive `pgrep -P` | `syscall.Kill(-pgid)` (whole tree) |
| Health check | None | HTTP/TCP/command probes with latency |
| Auto-restart | None | Watchdog with exponential backoff |
| Parallel start | Serial loop | Goroutine per service, toposort layers |
| Agent support | None | `ensure`, `ready`, `watch`, `depsState`, `hint` |
| PID files | Bare number | JSON (user, timestamp, command) |
| Concurrent safety | None | `flock` cross-process lock |
| Resource monitoring | None | CPU% + memory per service |
| Shell dependency | bash, jq, curl, lsof | Single Go binary |

## License

[MIT](LICENSE)
