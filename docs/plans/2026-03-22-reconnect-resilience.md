---
plan_id: "2026-03-22-reconnect-resilience"
created_at: "2026-03-22"
status: "draft"
priority: "medium"
estimated_duration: "45m"
tags: ["resilience", "reconnect", "gateway", "workspace-agent"]
---

# Reconnect & Resilience

## Цель

Workspace Agent переживает обрывы сети без потери состояния.

## Текущее состояние (уже работает)

- GatewayClient: exponential backoff reconnect (1s → 60s) ✅
- hostId persistence: agent отправляет hostId в hello при reconnect ✅
- Token refresh перед reconnect (onTokenExpired callback) ✅
- Pending adapter calls reject'ятся на disconnect ✅
- Gateway: heartbeat watchdog (degraded после timeout) ✅
- Gateway: setOffline + cancel executions на disconnect ✅

## Что нужно добавить

### 1. Grace period на Gateway

**Проблема**: Gateway мгновенно делает host offline при disconnect. Если agent reconnect'ится за 2-3 секунды, resolve-host в этом окне вернёт 404.

**Решение**: Grace period — internal implementation detail в `HostRegistry`. Status остаётся `online` в течение grace window (не новый status в schema). Timer внутри registry. Если agent reconnect'ится до expiry — timer отменяется. Если нет — переводим в offline.

**`reconnecting` status в schema**: оправдан для workflow resilience — engine может подождать grace period вместо immediate fail. Studio показывает стабильный "reconnecting..." вместо моргания offline/online. Backwards-compatible enum extension.

### 2. Connection state logging

**Проблема**: Нет логов при reconnect — трудно диагностировать проблемы.

**Решение**: `opts.logger` (optional, injectable). Log: reconnect attempt, backoff delay, connected/failed.

## Шаги

### Phase 1: Grace period

**1.1** `HostRegistry` — grace period в `setOffline()`
- Не меняем status сразу → ставим внутренний таймер
- Configurable: `reconnectGraceMs` (default: 10s), передаётся в конструктор
- `graceTimers: Map<string, Timer>` — internal state, не в HostDescriptor
- `setOnline()` во время grace → cancel timer, host никогда не уходил в offline
- Timer expired → `setOffline()` реально применяется (status: 'offline', connections: [])

**1.2** ws-handler — не отменять executions сразу при disconnect
- Delay cancel executions на grace period (или убрать — execution timeout сам справится)

### Phase 2: Connection logging

**2.1** GatewayClient — injectable logger
- `opts.logger?: { info, warn, debug }` (не создаём свой — инжектим)
- Log points: `doConnect()`, `onOpen()`, `onClose()`, `scheduleReconnect()`
- Include: attempt number, backoff delay, hostId

### Phase 3: Tests

**3.1** Unit tests
- Grace period: setOffline → setOnline before expiry → status never changed
- Grace period: setOffline → timer expires → status becomes offline
- Grace period: setOffline → setOffline again → only one timer
- Logger injection: verify log calls on reconnect

**3.2** Build + QA

## Файлы

| Файл | Действие |
|------|----------|
| `gateway-app/src/hosts/registry.ts` | Grace period logic (internal timers) |
| `gateway-app/src/hosts/ws-handler.ts` | Delay execution cancel during grace |
| `host-agent-core/src/ws/gateway-client.ts` | Injectable logger + reconnect logging |
| `gateway-app/src/__tests__/registry.test.ts` | Grace period tests |

## Не входит в scope

- HTTP proxy support (enterprise feature, premature)
- Pending call retry on reconnect (reject is safer, at-most-once)
- Message queue / offline buffer
