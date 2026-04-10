# ADR-0053: Delivery Semantics

**Date:** 2026-03-21
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-03-21
**Tags:** [delivery, idempotency, timeout, reconnect, workspace-agent]

## Context

Workspace Agent выполняет плагины удалённо от платформы. Плагины могут иметь необратимые side effects (`git commit`, `git push`, file mutations, shell commands). Сетевые сбои (WS disconnect, timeout) могут оставить платформу в неведении: выполнился запрос или нет.

Наивный retry для mutating plugins → double commit, double push, двойные файловые мутации.

Нужно зафиксировать:
1. Idempotency contract
2. Timeout ownership и budget propagation
3. Reconnect behavior
4. Ordering guarantees

## Decision

### Idempotency

**Mutating plugins → `at-most-once`.**
**Read-only plugins → retry allowed.**

#### Execution Journal

Workspace Agent хранит short-lived in-memory journal:

```typescript
Map<executionRequestId, {
  status: 'started' | 'completed';
  result?: unknown;
  error?: unknown;
  startedAt: number;
}>
```

**Поведение:**

| Состояние | Повторный запрос с тем же `executionRequestId` |
|-----------|----------------------------------------------|
| Не в journal | Нормальное выполнение, записать `started` |
| `started` | Reject: `EXECUTION_IN_PROGRESS` |
| `completed` (success) | Return cached result (deduplicated) |
| `completed` (error) | Return cached error |

**TTL:** записи в journal живут 5 минут после completion. Достаточно для retry window, не расходует память.

**Scope:** journal per Workspace Agent instance. При restart daemon'а journal теряется — это приемлемо: restart = новое WS соединение = новый session, platform не будет retry старые requestId'ы.

#### Platform-side contract

Platform **НЕ делает automatic retry** для mutating execution requests. Если WS отвалился mid-execution:
- Platform получает disconnect notification
- Показывает юзеру: "Соединение потеряно. Результат неизвестен."
- Юзер решает: повторить или проверить вручную

Для read-only (analysis, review) — platform может retry автоматически с новым `executionRequestId`.

### Timeout Budget

```
Execution request: timeoutMs = 120s (default)
  │
  ├── Plugin starts execution
  │     │
  │     ├── ctx.llm.complete() → adapter:call
  │     │     timeout = min(call.timeout, remainingBudget)
  │     │     remainingBudget = timeoutMs - (now - startedAt)
  │     │
  │     ├── ctx.cache.get() → adapter:call
  │     │     timeout = remainingBudget
  │     │
  │     └── ... more adapter calls
  │
  └── Execution timeout fires → AbortSignal → plugin handler aborts
```

**Кто владеет timeout:**
- `ExecutionHandler` создаёт `AbortController` с `timeoutMs`
- `AbortSignal` передаётся в `runInProcess()` → plugin handler
- `GatewayTransport` использует `remainingBudget` для каждого `adapter:call`
- Если общий timeout fires → все pending adapter calls reject → plugin handler получает error

**Timeout propagation в adapter:call:**

```typescript
// GatewayTransport.send()
const elapsed = Date.now() - executionStartedAt;
const remaining = executionTimeoutMs - elapsed;
if (remaining <= 0) throw new TimeoutError('Execution budget exhausted');

call.timeout = Math.min(call.timeout ?? DEFAULT_ADAPTER_TIMEOUT, remaining);
```

### Reconnect Behavior

**При WS disconnect:**

1. `GatewayClient.onClose()` fires
2. `GatewayTransport.rejectAllPending()` — все pending `adapter:call` promises reject с `TransportError`
3. Plugin handler получает error от `ctx.llm.complete()` (или другого proxy call)
4. `ExecutionHandler` catches error → записывает в journal как `completed` (error)
5. Возвращает error через... ничего — WS уже down

**На стороне Gateway:**
6. `globalDispatcher.removeConnection(hostId)` — host больше не доступен
7. `executionRegistry.cancelByHost(hostId, 'disconnect')` — все execution от этого host помечены cancelled
8. Platform получает disconnect event

**После reconnect:**
9. `GatewayClient` reconnects с backoff (1s → 2s → 4s → max 60s)
10. Sends `hello` с capabilities → Gateway re-registers host
11. **НЕ replay pending calls** — at-most-once для mutating
12. Platform может послать новые execution requests

**Частичный результат при disconnect:**

Если plugin успел сделать `git commit` но WS отвалился до возврата result:
- Commit **уже произошёл** на Workspace Agent (необратимо)
- Platform не знает о результате
- Journal на Workspace Agent имеет `completed` (success) с result
- При повторном запросе с тем же `executionRequestId` → journal вернёт cached result

### Ordering Guarantees

**Adapter calls:** НЕТ ordering guarantees между concurrent calls. Каждый `adapter:call` — независимый request/response. Plugin handler сам управляет порядком через `await`.

**Execution requests:** Sequential per Workspace Agent. Workspace Agent обрабатывает один execution request за раз (Phase 1). Concurrent execution — Phase 3+ с worker pool.

### Error Codes

| Code | Когда | Retry | HTTP |
|------|-------|-------|------|
| `WORKSPACE_AGENT_OFFLINE` | Host не подключён | yes (backoff) | 503 |
| `EXECUTION_IN_PROGRESS` | Duplicate `executionRequestId`, status=started | no | 409 |
| `EXECUTION_DEDUPLICATED` | Duplicate `executionRequestId`, status=completed | no | 200 |
| `ADAPTER_CALL_TIMEOUT` | Adapter call exceeded timeout budget | yes | 504 |
| `ADAPTER_CALL_REJECTED` | Method не в allowlist | no | 403 |
| `EXECUTION_BUDGET_EXHAUSTED` | Общий timeout execution истёк | no | 504 |
| `TRANSPORT_DISCONNECTED` | WS отвалился mid-execution | yes (reconnect) | 502 |
| `PLUGIN_NOT_FOUND` | Plugin не найден на Workspace Agent | no | 404 |

## Consequences

### Positive

- `at-most-once` для mutating — нет risk of double-commit.
- Execution journal дёшев (in-memory, TTL 5min) и прост.
- Timeout budget propagation — adapter calls не могут пережить execution timeout.
- Reconnect behavior чётко определён — нет ambiguity.
- Platform не делает automatic retry для mutating — юзер в контроле.

### Negative

- `at-most-once` значит потенциальная потеря execution при disconnect. Приемлемо: journal на host имеет result, повторный запрос вернёт cached.
- Sequential execution (Phase 1) = bottleneck. Приемлемо: один юзер = один Workspace Agent = последовательные команды.
- Journal теряется при restart daemon'а. Приемлемо: restart = новая сессия.

### Alternatives Considered

- **At-least-once + plugin idempotency** — отвергнуто: требует idempotency от каждого plugin author. `git commit` не идемпотентен по природе.
- **Persistent journal (disk)** — отвергнуто для Phase 1: усложняет, in-memory достаточно для CLI-oriented workflow.
- **Automatic retry для mutating** — отвергнуто: риск double side effects выше чем стоимость manual retry.
- **Distributed execution journal** — отвергнуто для Phase 1: overkill для single Workspace Agent.

## Implementation

### Файлы

| Файл | Что |
|------|-----|
| `host-agent-core/src/handlers/execution-handler.ts` | Execution journal, timeout budget, abort handling |
| `host-agent-core/src/transport/gateway-transport.ts` | Timeout budget propagation в adapter:call |
| `host-agent-core/src/ws/gateway-client.ts` | `rejectAllPending()` в onClose |
| `plugin-execution-factory/src/errors.ts` | Новые error codes |
| `gateway-app/src/hosts/ws-handler.ts` | Disconnect → cancel executions |

## References

- [ADR-0017: Workspace Agent Architecture](../../../public/kb-labs/docs/adr/0017-workspace-agent-architecture.md)
- [ADR-0051: Bidirectional Gateway Protocol](./0051-bidirectional-gateway-protocol.md)
- [ADR-0052: Execution Routing & Fallback](./0052-execution-routing-and-fallback.md)
- [Gateway ADR-0010: Unified Execution Contour](../../../infra/kb-labs-gateway/docs/adr/0010-unified-execution-contour.md) — ExecutionRegistry, cancellation, retry

---

**Last Updated:** 2026-03-21
