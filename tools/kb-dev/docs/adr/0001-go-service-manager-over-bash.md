# ADR-0001: Go Service Manager Over Bash

**Date:** 2026-03-30
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-03-30
**Tags:** [architecture, process-management, reliability]

## Context

The KB Labs platform uses 12 local development services (qdrant, redis, state-daemon, workflow, rest, gateway, studio, etc.) managed by `scripts/dev.sh` — a 957-line bash script.

The bash approach has fundamental reliability issues:

1. **False-positive liveness.** `lsof` port check treats any process on a port as the expected service. A Chrome tab or unrelated vite dev server on port 3000 makes `studio` appear "alive" when it's not running.

2. **No health check = healthy.** Services without a `healthCheck` config field are assumed healthy if the port is occupied (`is_health_ok` returns `true` when healthCheck is empty).

3. **Fragile process tree kill.** Recursive `pgrep -P` in bash misses orphaned children, zombie processes, and deeply nested trees (pnpm → node → vite → esbuild).

4. **No auto-restart.** A crashed service stays dead until someone runs `dev:status` and notices.

5. **Race conditions.** Two concurrent `dev:start` invocations can race on PID files and port checks.

6. **Login shell dependency.** `bash -lc` loads the entire `.zprofile`/`.bash_profile` for every service start, adding 200-500ms per service and breaking on fish/nushell/CI environments.

## Decision

Replace `dev.sh` with a Go binary (`kb-dev`) that provides proper process management:

### Process Groups (Setpgid)
Every spawned process gets its own process group via `syscall.SysProcAttr{Setpgid: true}`. Kill is a single syscall: `syscall.Kill(-pgid, SIGTERM)` — no recursive pgrep.

### PID-First Architecture
kb-dev knows the PID because it spawned the process (`cmd.Process.Pid`). Port checks are only used for `--force` and `doctor` diagnostics. This eliminates the "who's on the port?" problem entirely.

### Rich PID Files
PID files are JSON (not bare numbers):
```json
{"pid": 12345, "pgid": 12345, "user": "kirill", "command": "node ...", "startedAt": "2026-03-30T14:30:00Z"}
```

### Environment Resolution
Instead of `bash -lc` (login shell), kb-dev resolves node/pnpm/docker paths once at startup, caches them in `.kb/tmp/env-cache.json`, and injects PATH directly. 2-5x faster, works with any shell.

### State Machine
Each service has a validated state machine: `dead` → `starting` → `alive` | `failed` → `stopping` → `dead`. Invalid transitions are rejected with errors.

### Agent-First JSON Protocol
Every command supports `--json` with a consistent contract:
- `ok: bool` — single field to check
- `hint: string` — exact fix command on failure
- `logsTail: []string` — last log lines on failure (no second call)
- `depsState: map` — dependency states at a glance
- `ensure` command — idempotent desired state
- `ready` command — blocking readiness gate
- `watch` command — JSONL event streaming

### ServiceRunner Interface
Manager works through `service.Runner` interface. Currently `LocalRunner` only. Future: `DockerComposeRunner`, `RemoteRunner` (SSH) — no Manager changes needed.

## Consequences

### Positive

- Honest status reporting — no more false "alive" for alien processes
- Reliable process cleanup — process group kill catches entire tree
- Auto-restart with backoff — crashed services recover automatically
- Parallel startup — goroutine per service, 2-3x faster than serial bash
- Agent automation — `ensure`/`ready`/`watch` enable autonomous workflows
- Zero runtime deps — single Go binary, no jq/curl/lsof/bash dependency
- Cross-platform — darwin + linux from one codebase

### Negative

- Go binary must be built and distributed (goreleaser handles this)
- Two systems during migration (dev.sh fallback + kb-dev)
- Developers need Go 1.24+ to build from source

### Alternatives Considered

- **PM2** — Node-based, good process management but no dependency graph, no agent protocol, adds Node runtime dependency
- **Docker Compose for everything** — Too heavy for dev, slow iteration, not all services are containerized
- **Fix dev.sh** — Fundamental issues (lsof-based detection, bash process management) can't be solved in bash
- **Turborepo dev** — Only handles Node services, no Docker, no custom health checks

## Implementation

1. Go binary at `infra/kb-labs-dev/` with same conventions as `installer/kb-labs-create/`
2. Reads existing `.kb/dev.config.json` — no config migration needed
3. `scripts/dev.sh` gets a preamble that delegates to `kb-dev` if on PATH
4. Gradual migration: both tools work during transition period

## References

- [KB Labs Dev Environment Docs](.kb/DEV_ENVIRONMENT.md)
- [kb-create reference architecture](installer/kb-labs-create/)

---

**Last Updated:** 2026-03-30
