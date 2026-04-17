# kb-deploy

**Git-aware deploy tool: build → push → SSH → `docker compose up`.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Go](https://img.shields.io/badge/Go-1.24+-00ADD8.svg)](https://go.dev)

## Why not a Makefile?

A Makefile re-deploys everything every time. kb-deploy reads `watch:` paths and detects which targets were actually touched by the last commit. If nothing changed in your `api` service, it's skipped — no build, no push, no restart.

It also tracks state. After each deploy, kb-deploy writes `.kb/deploy-state.json` so you can answer: *"what git SHA is running on vps-1 right now?"*

| Aspect | Makefile / shell script | kb-deploy |
|--------|------------------------|-----------|
| Skip unchanged services | No — always deploys | Yes — `watch:` paths + git diff |
| State tracking | None | `.kb/deploy-state.json` (SHA + timestamp) |
| SSH key handling | Hard-coded paths in scripts | Env vars per target |
| Registry auth on remote | Manual | Auto `docker login` if `GHCR_TOKEN` is set |
| Fail-fast env check | None | Validates all env vars before any build |

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/KirillBaranov/kb-labs-deploy/main/install.sh | sh
```

Or build from source:

```bash
git clone https://github.com/KirillBaranov/kb-labs-deploy
cd kb-labs-deploy && make build
```

---

## First Deploy in 5 Minutes

### Step 1 — SSH key

kb-deploy authenticates with a private key. Generate a dedicated deploy key and add it to your server:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/deploy_key -C "kb-deploy"
ssh-copy-id -i ~/.ssh/deploy_key.pub ubuntu@your-vps.example.com
```

Export the path so kb-deploy can find it:

```bash
export DEPLOY_KEY=~/.ssh/deploy_key
# or add to .env in your project root
```

### Step 2 — Registry

For GitHub Container Registry (ghcr.io):

```bash
# Log in locally (needed for `docker push`)
echo $GITHUB_TOKEN | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin

# Set GHCR_TOKEN so kb-deploy can log in on the remote host too
export GHCR_TOKEN=$GITHUB_TOKEN
```

For any private registry, just ensure `docker login` is done locally. Set `GHCR_TOKEN` only for ghcr.io — otherwise the remote host needs to be logged in separately.

### Step 3 — deploy.yaml

```yaml
# .kb/deploy.yaml
registry: ghcr.io/your-github-username

targets:
  api:
    watch: [src/, package.json]       # deploy only if these paths changed
    image: my-project/api             # image name (registry prefix added automatically)
    dockerfile: Dockerfile
    context: .
    ssh:
      host: your-vps.example.com      # hostname or IP
      user: ubuntu
      key_path_env: DEPLOY_KEY        # env var holding the path to your private key
    remote:
      compose_file: ~/app/docker-compose.yml
      service: api
```

### Step 4 — docker-compose.yml on the remote host

```yaml
# ~/app/docker-compose.yml  (on your VPS)
services:
  api:
    image: ghcr.io/your-github-username/my-project/api:${IMAGE_TAG}
    ports: ["3000:3000"]
    restart: unless-stopped
```

kb-deploy sets `IMAGE_TAG` to the short git SHA before calling `docker compose up -d`.

### Step 5 — Deploy

```bash
kb-deploy run
```

```
api
  ✓ built  ghcr.io/.../api:abc1234
  ✓ pushed ghcr.io/.../api:abc1234
  ✓ deployed api @ abc1234
```

---

## Commands

| Command | Description |
|---------|-------------|
| `kb-deploy run [target]` | Build and deploy affected (or specified) targets |
| `kb-deploy run --all` | Deploy all targets regardless of git changes |
| `kb-deploy list` | List configured targets with their image and host |
| `kb-deploy status` | Show last deployed SHA and timestamp per target |
| `kb-deploy infra up [service]` | Start infrastructure services (postgres, redis, etc.) |
| `kb-deploy infra down [service]` | Stop infrastructure services |

### Flags

| Flag | Description |
|------|-------------|
| `--all` | Deploy all targets (skip git diff) |
| `--json` | Structured JSON output |
| `--config <path>` | Explicit config file path |

### JSON output

```bash
kb-deploy run --json
```

```json
{
  "ok": true,
  "sha": "abc1234",
  "results": [
    {"target": "api", "sha": "abc1234", "ok": true}
  ]
}
```

---

## Configuration Reference

```yaml
# .kb/deploy.yaml  (or deploy.yaml in project root)
registry: ghcr.io/your-github-username   # Docker registry prefix

# Optional: stateful infrastructure (postgres, redis, etc.)
# Managed independently from app targets — not touched by `run` unless strategy: diff
infrastructure:
  postgres:
    type: docker-image
    image: postgres:16
    ssh:
      host: your-vps.example.com
      user: ubuntu
      key_path_env: DEPLOY_KEY
    volumes: [postgres-data:/var/lib/postgresql/data]
    ports: ["5432:5432"]
    env:
      POSTGRES_PASSWORD: "${POSTGRES_PASSWORD}"
    restart: unless-stopped
    strategy: manual  # "manual" (default) | "diff" (redeploy if image tag changed)

targets:
  api:
    watch: [src/, package.json]   # files/dirs to watch (relative to repo root)
    image: my-project/api         # image name under registry/
    dockerfile: Dockerfile        # default: Dockerfile
    context: .                    # docker build context, default: .
    bundle: "@my-org/api"         # optional: run kb-devkit bundle before docker build
    ssh:
      host: your-vps.example.com
      user: ubuntu
      key_path_env: DEPLOY_KEY    # preferred: env var with path to private key file
      # key_env: DEPLOY_KEY_PEM   # legacy: env var with PEM content directly
    remote:
      compose_file: ~/app/docker-compose.yml
      service: api
```

### SSH key options

| Field | What it expects |
|-------|----------------|
| `key_path_env` | Name of env var whose **value is a file path**, e.g. `DEPLOY_KEY=~/.ssh/deploy_key` |
| `key_env` | Name of env var whose **value is the PEM content** (legacy, avoid for new setups) |

### Environment variable substitution

Any value in `deploy.yaml` supports `${VAR}` substitution from the process environment or `.env`:

```yaml
env:
  POSTGRES_PASSWORD: "${POSTGRES_PASSWORD}"
```

---

## How It Works

```
git diff HEAD~1 HEAD   →   affected targets (watch: paths)
         │
         ▼
  docker build + tag (git SHA)
         │
         ▼
  docker push → registry
         │
         ▼
  SSH → docker pull → docker compose up -d
         │
         ▼
  .kb/deploy-state.json  (SHA + timestamp per target)
```

**Affected detection:** kb-deploy compares `watch:` globs against files changed in the last commit. If none match, the target is skipped.

**Image tagging:** images are tagged with the short git SHA (`abc1234`). The remote host receives `IMAGE_TAG=abc1234` as an env var for `docker compose up`.

---

## Development

```bash
make build    # build for current platform
make test     # run tests
make lint     # golangci-lint
```

## License

[MIT](LICENSE)
