---
plan_id: "2026-03-22-container-and-integration"
created_at: "2026-03-22"
status: "draft"
priority: "high"
estimated_duration: "1h"
tags: ["container", "docker", "integration", "workflow", "cli", "studio"]
---

# Container Workspace + Multi-Host Integration (Blocks 4+5)

## Цель

1. Workspace Agent запускается в Docker контейнере (тимлид на удалённой машине)
2. Platform полностью интегрирована: workflow dispatch, CLI list, Studio visibility

## Блок 4: Container Workspace (packaging)

Архитектурно всё готово — нужен только Docker packaging.

### 4.1 Dockerfile для host-agent-app
- Base: `node:20-slim`
- Copy: host-agent-app dist + dependencies
- Entrypoint: auto-register if no credentials → connect → ready
- Env vars: `GATEWAY_URL`, `GATEWAY_CLIENT_ID`, `GATEWAY_CLIENT_SECRET`, `HOST_NAME`

### 4.2 docker-compose.yml пример
- agent service: build from Dockerfile
- env vars from `.env`
- Volume mount workspace (optional)
- Network: connects to Gateway

### 4.3 Entrypoint script
- Check if `~/.kb/agent.json` exists → use existing credentials
- If not → register via `POST /hosts/register` → save credentials
- Start daemon

## Блок 5: Multi-Host Integration

### 5.1 CLI: `kb workspace list`
- Команда в host-agent-cli
- GET /hosts через Gateway REST API (auth required)
- Таблица: hostId, name, status, capabilities, lastSeen
- `--json` для agent mode

### 5.2 Workflow dispatch с target.type
- WorkflowStep schema: optional `target` field
- Workflow engine: pass target to ExecutionRequest
- Пример workflow с workspace-agent target

### 5.3 REST API host endpoints
- Уже есть: `GET /hosts`, `GET /hosts/:hostId`, `DELETE /hosts/:hostId`
- Studio использует `/hosts` для дашборда — уже работает

## Шаги

### Phase 1: Dockerfile + entrypoint
- `infra/kb-labs-host-agent/Dockerfile`
- `infra/kb-labs-host-agent/docker-entrypoint.sh`
- `infra/kb-labs-host-agent/docker-compose.example.yml`

### Phase 2: CLI workspace list
- `host-agent-cli/src/commands/list.ts` — kb workspace:list
- Build + clear cache + test

### Phase 3: Workflow target support
- Check if workflow engine already passes target → likely yes
- Add example workflow definition with workspace-agent target

### Phase 4: Tests + QA
- Build all
- QA run
- AI review

## Файлы

| Файл | Действие |
|------|----------|
| `infra/kb-labs-host-agent/Dockerfile` | NEW |
| `infra/kb-labs-host-agent/docker-entrypoint.sh` | NEW |
| `infra/kb-labs-host-agent/docker-compose.example.yml` | NEW |
| `host-agent-cli/src/commands/list.ts` | NEW: workspace:list |
| `host-agent-cli/src/manifest.json` | Add list command |

## Не входит в scope

- Kubernetes deployment (future)
- Auto-scaling agents
- Agent health dashboard in Studio (endpoint exists, UI is separate work)
