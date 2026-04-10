# KB Labs — Architecture Guide

> One page. Everything you need to understand what runs, why, and when.

---

## Service Map

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                  │
│   CLI (developer)    Studio (browser)    REST API (external)     │
└──────────┬──────────────┬──────────────────┬────────────────────┘
           │              │                  │
           ▼              ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│  GATEWAY :4000 — single entry point                              │
│                                                                   │
│  Routes:                                                          │
│    /api/v1/*    → proxy → REST API :5050                         │
│    /api/exec/* → proxy → Workflow :7778                          │
│    /hosts/*    → host registry (register, list, WS connect)      │
│    /auth/*     → JWT auth (register, token, refresh)             │
│    /internal/* → dispatch + resolve-host (x-internal-secret)     │
│                                                                   │
│  WebSocket:                                                       │
│    /hosts/connect   → Host Agent connections                      │
│    /clients/connect → Studio live updates                        │
└───────┬───────────────┬──────────────────┬──────────────────────┘
        │               │                  │
        ▼               ▼                  ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────────────────────┐
│ REST API     │ │ Workflow     │ │ Host Agents (0..N)            │
│ :5050        │ │ :7778        │ │                                │
│              │ │              │ │ ┌────────────────────────────┐ │
│ Platform API │ │ Job engine   │ │ │ Agent on dev machine       │ │
│ Plugin exec  │ │ DAG runner   │ │ │  - fs, git, execution     │ │
│ QA, review   │ │ Sandboxing   │ │ └────────────────────────────┘ │
│ Analytics    │ │              │ │ ┌────────────────────────────┐ │
│              │ │              │ │ │ Agent in Docker container  │ │
│              │ │              │ │ │  - isolated execution      │ │
└──────┬───────┘ └──────┬───────┘ │ └────────────────────────────┘ │
       │                │         └──────────────────────────────┘
       ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│  INFRASTRUCTURE                                                   │
│                                                                   │
│  State Daemon :7777  — distributed state (workflow state, locks)  │
│  Redis :6379         — cache backend (optional, InMemory default) │
│  Qdrant :6333        — vector DB for Mind RAG                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## What Each Service Does

| Service | Port | What it does | When you need it |
|---------|------|-------------|-----------------|
| **Gateway** | 4000 | Single entry point. Proxies REST/Workflow. Manages Host Agent connections. Auth. | Always (if using Studio or Host Agents) |
| **REST API** | 5050 | Platform API — plugin execution, QA, review, analytics, adapter calls | Always (core of the platform) |
| **Workflow** | 7778 | Job execution engine — DAG runner, sandboxed steps, background jobs | Workflows, `pnpm kb workflow:run`, background jobs |
| **State Daemon** | 7777 | Distributed state — workflow state, locks, counters | Always (dependency of Workflow + Gateway) |
| **Redis** | 6379 | Cache backend. Survives process restarts (unlike InMemory) | Optional. Useful when Gateway restarts shouldn't lose host registry |
| **Qdrant** | 6333 | Vector database for Mind RAG semantic search | `pnpm kb mind rag-query`, `pnpm kb mind rag-index` |
| **Studio** | 3000 | Web UI — dashboards, QA, workflow monitoring, host management | When you want the browser UI |
| **Host Agent** | — | Daemon connecting this machine to Gateway via WebSocket | Remote execution, multi-machine setups |
| **Runtime Server** | — | Plugin execution host with `execution` capability | Server-side plugin execution |

---

## Dependency Graph

```
Studio :3000
  └─ REST API :5050
       └─ Workflow :7778
            └─ State Daemon :7777
                 └─ Redis :6379 (optional)

Gateway :4000
  └─ State Daemon :7777
  └─ proxies → REST API :5050
  └─ proxies → Workflow :7778

Host Agent
  └─ Gateway :4000 (WS connection)

Qdrant :6333 (standalone, no deps)
```

**Start order:** Redis → State Daemon → Workflow → REST API → Gateway → Studio

`pnpm dev:start` handles this automatically.

---

## What to Run When

### Solo developer (CLI only, no browser)

**Nothing.** CLI plugins execute in-process. No services needed for:
- `pnpm kb commit commit`
- `pnpm kb qa regressions`
- `pnpm kb review:run`
- `npx kb-devkit-ci`
- All DevKit tools

**Exception:** Mind RAG needs Qdrant:
```bash
pnpm dev:start qdrant    # Just Qdrant, nothing else
pnpm kb mind rag-query --text "..." --agent
```

### Solo developer (with Studio UI)

```bash
pnpm dev:start           # Starts everything
# → http://localhost:3000
```

Or minimal set:
```bash
pnpm dev:start backend   # State Daemon + Workflow + REST API + Gateway
pnpm dev:start studio    # Studio (auto-starts REST API dep)
```

### Team setup (multiple machines)

Each developer machine:
```bash
pnpm dev:start host-agent   # Connects to shared Gateway
```

Shared server:
```bash
pnpm dev:start infra backend   # All infrastructure + backend
```

### CI / Production

```bash
pnpm dev:start infra backend   # No Studio, no agents
# Gateway handles external API access
```

---

## Execution Modes

KB Labs supports 3 execution modes for plugins:

| Mode | Where | Config | Use case |
|------|-------|--------|----------|
| **in-process** | Same Node.js process | `mode: "in-process"` (default) | CLI, fast plugins |
| **worker-pool** | Separate process | `mode: "worker-pool"` | Fault isolation |
| **container** | Docker container | `mode: "container"` | Full isolation, untrusted code |

CLI always runs `in-process`. Platform (REST API, Workflow) can route to any mode.

### Workspace Agent Execution Flow

```
Platform (Workflow job)
  → RoutingBackend: target.type = "workspace-agent"
    → IHostResolver.resolve() → Gateway /internal/resolve-host → hostId
    → buildTransport(hostId) → Gateway /internal/dispatch
      → Gateway WS → Host Agent
        → LocalPluginResolver finds plugin
        → ExecutionHandler runs handler
        → Result back through WS → Gateway → Platform
```

---

## Port Reference

| Port | Service | Health Check |
|------|---------|-------------|
| 3000 | Studio | `http://localhost:3000` |
| 4000 | Gateway | `http://localhost:4000/health` |
| 5050 | REST API | `http://localhost:5050/api/v1/health` |
| 6333 | Qdrant | `http://localhost:6333/` |
| 6379 | Redis | `redis-cli ping` |
| 7777 | State Daemon | `http://localhost:7777/health` |
| 7778 | Workflow | `http://localhost:7778/health` |

Observability surfaces:

- Gateway: `http://localhost:4000/metrics`, `http://localhost:4000/observability/describe`, `http://localhost:4000/observability/health`
- REST API: `http://localhost:5050/api/v1/metrics`, `http://localhost:5050/api/v1/observability/describe`, `http://localhost:5050/api/v1/observability/health`
- Workflow: `http://localhost:7778/metrics`, `http://localhost:7778/observability/describe`, `http://localhost:7778/observability/health`
- State Daemon: `http://localhost:7777/metrics`, `http://localhost:7777/observability/describe`, `http://localhost:7777/observability/health`
- Marketplace API: `http://localhost:5070/metrics`, `http://localhost:5070/observability/describe`, `http://localhost:5070/observability/health`

Observability compliance:

```bash
pnpm observability:check
pnpm observability:check:json
```

Supported inventory baseline:

| Service | Contract Surface | Notes |
|---------|------------------|-------|
| Gateway | compliant | Gateway auth required for observability routes |
| REST API | compliant | `/api/v1` base path |
| Workflow | compliant | root-level canonical endpoints |
| State Daemon | compliant | root-level canonical endpoints plus `/stats` |
| Marketplace API | compliant | root-level canonical endpoints |

---

## Common Operations

### Start/Stop

```bash
pnpm dev:start              # Start all
pnpm dev:start backend      # Start group
pnpm dev:start rest         # Start single + deps
pnpm dev:stop               # Stop all
pnpm dev:stop rest          # Stop single
pnpm dev:restart gateway    # Restart + cascade dependents
```

### Status & Health

```bash
pnpm dev:status             # Table: alive/degraded/dead
pnpm dev:status --json      # Machine-readable
pnpm dev:health             # Health checks
pnpm dev:logs rest          # Last 50 lines
pnpm dev:logs rest 200      # Last 200 lines
```

### Troubleshooting

```bash
# Service won't start (port conflict)
./scripts/dev.sh start rest --force      # Kills whatever is on the port

# Service degraded
pnpm dev:logs <service>                  # Check what happened
./scripts/dev.sh restart <service> --force

# Ghost host-agent daemons stealing CLI execution
pkill -9 -f "host-agent-app/dist/index.js"
pnpm kb plugins clear-cache --deep

# Stale hosts showing "online" after Gateway restart
# Fixed: Gateway resets all hosts to offline on startup
# If still seeing stale hosts, restart Gateway:
./scripts/dev.sh restart gateway --force
```

---

## Environment Variables

| Variable | Default | Service | Purpose |
|----------|---------|---------|---------|
| `GATEWAY_JWT_SECRET` | `dev-insecure-secret` | Gateway | JWT signing (change in prod!) |
| `GATEWAY_INTERNAL_SECRET` | `dev-internal-secret-kb-labs` | Gateway | Internal dispatch auth |
| `REST_API_URL` | `http://localhost:5050` | Host Agent | REST API for reverse proxy |
| `GATEWAY_ALLOW_WS` | — | Host Agent | Enable WS connection |
| `OPENAI_API_KEY` | — | Mind RAG | Embeddings (optional, falls back to deterministic) |
| `QDRANT_URL` | `http://localhost:6333` | Mind RAG | Vector store URL |
| `KB_STATE_DAEMON_PORT` | `7777` | State Daemon | State daemon port |
| `KB_TENANT_ID` | `default` | All | Multi-tenancy tenant ID |

---

## File Locations

| Path | Purpose |
|------|---------|
| `.kb/dev.config.json` | Service definitions (ports, commands, deps) |
| `.kb/kb.config.json` | Platform config (adapters, profiles, scopes) |
| `.kb/logs/tmp/<service>.log` | Service logs (cleared on start) |
| `.kb/tmp/<service>.pid` | PID files (kill handle, not status source) |
| `~/.kb/agent.json` | Host Agent config (hostId, gateway URL, workspace paths) |
| `scripts/dev.sh` | Dev environment manager script |

---

## Architecture Principles

1. **Gateway is the single entry point** — all external traffic goes through `:4000`
2. **CLI is always local** — `pnpm kb` commands run in-process, no Gateway needed
3. **Host Agents are optional** — only for remote execution and multi-machine setups
4. **Port + health check = source of truth** — not PID files
5. **Services degrade gracefully** — Redis optional, Qdrant only for Mind RAG
6. **Stale hosts reset on restart** — Gateway sets all hosts offline on startup

---

*Last updated: 2026-03-22*
