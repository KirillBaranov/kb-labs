---
plan_id: "2026-03-21-multi-user-support"
created_at: "2026-03-21"
status: "in_progress"
priority: "high"
tags: ["workspace-agent", "cloud", "multi-user", "infrastructure"]
---

# Multi-User Support

> Поддержка 3 классов пользователей: разработчик (локально), тимлид (контейнер), C-level (web дашборды).

## Блок 1: Persistent Host Registry
> Gateway помнит hosts между рестартами

- [ ] Host model (hostId, name, capabilities, lastSeen, status, metadata) → SQLite
- [ ] Gateway: persist on register, restore on start, TTL cleanup
- [ ] REST API: `/api/v1/hosts` — list, get, deregister
- [ ] Health tracking: lastHeartbeat → online/offline/stale

## Блок 2: RoutingBackend
> Platform dispatch'ит plugin execution через Gateway к нужному host'у

- [ ] `WorkspaceAgentBackend` implements `IExecutionBackend` — dispatch через Gateway WS
- [ ] `RoutingBackend` в `plugin-execution-factory`: по `ExecutionTarget.type` выбирает backend (local / workspace-agent / container)
- [ ] Host selection strategies: `pinned`, `any-matching`, `prefer-local`
- [ ] Fallback policy: workspace-agent недоступен → local / error

## Блок 3: Reconnect & Resilience
> Workspace Agent переживает обрывы сети

- [ ] Auto-reconnect с exponential backoff в GatewayClient
- [ ] Session resume: hostId сохраняется, pending calls переотправляются
- [ ] Gateway: различает disconnect vs timeout, держит host online N секунд после disconnect
- [ ] `HTTPS_PROXY` / `HTTP_PROXY` support в transport

## Блок 4: Container Workspace
> Тимлид работает в контейнере, код монтирован или клонирован

- [ ] Workspace Agent Docker image (minimal Node.js + agent daemon)
- [ ] docker-compose: agent + volume mount рабочей директории
- [ ] Container auto-registration: agent стартует → register → connect → ready
- [ ] Platform services proxy работает из контейнера (уже есть, нужно проверить)

## Блок 5: Multi-Host Dispatch (интеграция)
> Workflow/REST API выбирает правильный host для execution

- [ ] Workflow engine: `target.type = 'workspace-agent'` в job spec
- [ ] REST API: dispatch endpoint с host selection
- [ ] Studio UI: видеть connected hosts, их capabilities, статус
- [ ] CLI: `kb workspace list` — показать все connected agents

---

**Порядок**: 1 → 2 → 3 → 4 → 5

**Зависимости**:
- Блок 1 — фундамент, нужен для всех остальных
- Блок 2 — зависит от 1 (нужен registry чтобы знать куда dispatch'ить)
- Блок 3 — независим, можно параллельно с 2
- Блок 4 — зависит от 1+2 (нужен dispatch чтобы container agent получал задачи)
- Блок 5 — финальная интеграция, зависит от 1+2+3
