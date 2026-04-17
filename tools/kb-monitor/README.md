# kb-monitor

**Read-only ops tool for services deployed with kb-deploy.**

Check status, tail logs, and run health checks across remote hosts — without SSH-ing in manually.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Go](https://img.shields.io/badge/Go-1.24+-00ADD8.svg)](https://go.dev)

## Why not just `ssh + docker compose`?

You could do this manually:

```bash
ssh ubuntu@vps-1 "docker compose -f ~/app/docker-compose.yml logs api --tail 50"
```

kb-monitor wraps that pattern and adds three things you don't get for free:

**Multi-host in one command.** If you have `api` on vps-1 and `worker` on vps-2, `kb-monitor status` checks both in parallel and shows a unified table. No tab-switching.

**`--json` for automation.** All commands emit structured JSON, so you can pipe into CI checks, alerting scripts, or agents without parsing terminal output.

**Permission control.** Define per-target which operations are allowed. Give your on-call engineer logs access without giving them `exec`.

If you have one server and you're comfortable with SSH, you don't need kb-monitor. It's for teams (or solo devs) running multiple services who want a single command that works everywhere.

---

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/KirillBaranov/kb-labs-monitor/main/install.sh | sh
```

Or build from source:

```bash
git clone https://github.com/KirillBaranov/kb-labs-monitor
cd kb-labs-monitor && make build
```

---

## Quick Start

kb-monitor reads the same `.kb/deploy.yaml` as kb-deploy. If you've already set up kb-deploy, there's nothing extra to configure.

```bash
# Status across all targets
kb-monitor status

# One target
kb-monitor status api

# Logs
kb-monitor logs api
kb-monitor logs api --follow
kb-monitor logs api --lines 100

# Health (docker healthcheck state)
kb-monitor health
kb-monitor health api

# Run a command in the container (requires exec: true in permissions)
kb-monitor exec api -- sh -c "cat /etc/hosts"
```

Sample `status` output:

```
api                   running  healthy
  started: 2026-04-17T09:14:22Z
  image:   ghcr.io/.../api:abc1234...

worker                stopped  -
```

---

## Commands

| Command | Description |
|---------|-------------|
| `kb-monitor status [target]` | Container state, uptime, and image SHA |
| `kb-monitor health [target]` | Docker healthcheck status (healthy / unhealthy / running) |
| `kb-monitor logs <target>` | Fetch log lines (`--lines N`, `--follow`) |
| `kb-monitor exec <target> -- <cmd>` | Run a command in the container |
| `kb-monitor infra status` | Status of infrastructure services (postgres, redis, etc.) |

### Flags

| Flag | Description |
|------|-------------|
| `--json` | Structured JSON output |
| `--config <path>` | Explicit config file path |
| `--lines N` | Number of log lines (default: 50) |
| `--follow` | Stream logs in real time (incompatible with `--json`) |

### JSON output

```bash
kb-monitor status --json
```

```json
{
  "ok": true,
  "targets": [
    {"service": "api", "running": true, "health": "healthy", "startedAt": "2026-04-17T09:14:22Z", "imageSHA": "ghcr.io/.../api:abc1234"},
    {"service": "worker", "running": false, "health": "unknown"}
  ]
}
```

---

## Configuration

kb-monitor uses `.kb/deploy.yaml` (same as kb-deploy). Optionally add `permissions:` per target to restrict what's allowed:

```yaml
targets:
  api:
    ssh:
      host: your-vps.example.com
      user: ubuntu
      key_path_env: DEPLOY_KEY
    remote:
      compose_file: ~/app/docker-compose.yml
      service: api
      container_name: app-api-1   # optional: override container name for docker inspect
    permissions:
      logs: true      # default: true
      health: true    # default: true
      exec: false     # default: false — disabled unless explicitly set
      rollback: true  # default: true
```

**Defaults when `permissions:` is omitted:** `logs: true`, `health: true`, `exec: false`, `rollback: true`.

---

## How It Works

```
.kb/deploy.yaml  →  SSH client per host  →  docker inspect / compose logs / compose exec
```

kb-monitor opens one SSH connection per unique host and runs `docker` commands remotely. It never stores credentials — SSH key path is read from the env var specified in `key_path_env` at runtime.

---

## Development

```bash
make build    # build for current platform
make test     # run tests
make lint     # golangci-lint
```

## License

[MIT](LICENSE)
