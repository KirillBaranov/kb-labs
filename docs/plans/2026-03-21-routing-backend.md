---
plan_id: "2026-03-21-routing-backend"
created_at: "2026-03-21"
status: "draft"
priority: "high"
estimated_duration: "1-2h"
tags: ["execution", "routing", "workspace-agent", "gateway"]
---

# RoutingBackend — Workspace Agent Dispatch

## Цель

Platform dispatch'ит plugin execution через Gateway к Workspace Agent'у
по `ExecutionTarget.type === 'workspace-agent'`.

## Текущее состояние

Почти всё готово:
- `RoutingBackend` в `isolated-backend.ts` роутит по `target.environmentId` → RemoteBackend
- `RemoteBackend` + `GatewayDispatchTransport` = dispatch через Gateway `/internal/dispatch`
- `ExecutionTarget` уже имеет `type`, `hostId`, `hostSelection`, `repoFingerprint`
- `globalDispatcher` в Gateway находит host по capability и отправляет через WS

## Принципы

1. **Execution layer не знает про Gateway** — только абстракции `IHostResolver`, `IExecutionTransport`
2. **Конкретные реализации инжектятся** через DI (config → bootstrap → factory)
3. **Единый routing flow** — workspace-agent и container mode используют одну и ту же цепочку
4. **Fallback = часть абстракции** — resolver возвращает null → backend применяет fallback policy

## Архитектура

```
ExecutionRequest { target: { type: 'workspace-agent', hostSelection: 'any-matching' } }
       │
       ▼
RoutingBackend
       │
       ├─ target.environmentId? → RemoteBackend (container mode, как сейчас)
       │
       ├─ target.type === 'workspace-agent'?
       │   ├─ IHostResolver.resolve(target) → hostId | null
       │   │   └─ (impl: GatewayHostResolver — HTTP к Gateway)
       │   ├─ hostId found → buildTransport(hostId) → RemoteBackend
       │   └─ hostId null → fallback policy (local | error)
       │
       └─ default → localBackend (in-process, worker-pool)
```

**Слои абстракции:**

```
core-contracts:     IHostResolver (interface)
                    IExecutionTransport (interface, уже есть)

gateway-core:       GatewayHostResolver implements IHostResolver
                    GatewayDispatchTransport implements IExecutionTransport (уже есть)

plugin-execution-factory:  RoutingBackend uses IHostResolver + IExecutionTransport
                          (не знает что за реализация)

core-runtime/loader:  создаёт GatewayHostResolver, передаёт в factory
                     (единственное место где знают про Gateway)
```

## Шаги

### Phase 1: Contracts

**1.1** `IHostResolver` interface в `core-contracts`
```typescript
interface HostResolution {
  hostId: string;
  strategy: HostSelectionStrategy;  // какая стратегия сработала
}

interface IHostResolver {
  resolve(target: ExecutionTarget): Promise<HostResolution | null>;
}
```

**1.2** Расширить `StrictIsolationOptions` — добавить workspace-agent поля
```typescript
interface StrictIsolationOptions {
  // ... existing
  /** Resolve hostId for workspace-agent routing */
  hostResolver?: IHostResolver;
  /** Build transport to a specific host (by hostId) */
  buildTransportForHost?: (hostId: string, namespaceId: string) => IExecutionTransport;
  /** What to do when host not found: 'local' or 'error' */
  fallbackPolicy?: 'local' | 'error';
}
```

### Phase 2: GatewayHostResolver

**2.1** Gateway endpoint: `POST /internal/resolve-host`
- Input: `{ namespaceId, target: ExecutionTarget }`
- Logic:
  - `pinned` (target.hostId set): verify host exists + online → return
  - `any-matching`: firstHostWithCapability('execution')
  - `prefer-local`: filter by hostType=local, fallback to any
  - `repoFingerprint`: match host workspaces
- Output: `{ hostId, strategy }` или 404

**2.2** `GatewayHostResolver` в `gateway-core` implements `IHostResolver`
- HTTP call к `POST /internal/resolve-host`
- Timeout, retry on 5xx
- Не знает про WS, dispatcher — просто HTTP client

### Phase 3: RoutingBackend Extension

**3.1** Расширить routing logic в `isolated-backend.ts`
```
execute(request):
  1. target.environmentId? → remote (existing)
  2. target.type === 'workspace-agent' && hostResolver?
     → resolution = hostResolver.resolve(target)
     → resolution? → buildTransportForHost(resolution.hostId) → RemoteBackend
     → null? → fallbackPolicy === 'local' ? localBackend : error
  3. provisionEnvironment? → auto-provision (existing)
  4. default → localBackend (existing)
```

### Phase 4: Config + Wiring

**4.1** Config schema: `execution.workspaceAgent` в `core-runtime/config.ts`
```json
{
  "execution": {
    "mode": "auto",
    "workspaceAgent": {
      "enabled": true,
      "gatewayUrl": "http://localhost:4000",
      "internalSecret": "...",
      "fallback": "local"
    }
  }
}
```

**4.2** `core-runtime/loader.ts` — bootstrap wiring
- Если `workspaceAgent.enabled` → создать `GatewayHostResolver` + `buildTransportForHost`
- Передать в `createIsolatedExecutionBackend({ strictIsolation: { hostResolver, buildTransportForHost, fallbackPolicy } })`
- Единственное место где import из gateway-core

### Phase 5: Tests

**5.1** Unit tests
- `GatewayHostResolver`: resolve strategies, fallback, HTTP errors
- `RoutingBackend`: workspace-agent branch, fallback policy, priority over local
- Integration: full flow mock (resolve → transport → execute)

**5.2** Build + QA

## Файлы

| Файл | Действие |
|------|----------|
| `core-contracts/src/host-resolver.ts` | NEW: IHostResolver interface |
| `core-contracts/src/index.ts` | Re-export IHostResolver |
| `gateway-core/src/resolver/gateway-host-resolver.ts` | NEW: HTTP implementation |
| `gateway-core/src/index.ts` | Re-export |
| `gateway-app/src/server.ts` | Add /internal/resolve-host endpoint |
| `plugin-execution-factory/src/isolated-backend.ts` | Extend routing logic |
| `plugin-execution-factory/src/types.ts` | Add hostResolver to options |
| `core-runtime/src/config.ts` | WorkspaceAgent config schema |
| `core-runtime/src/loader.ts` | Wire resolver + transport factory |

## Не входит в scope

- Reconnect / session resume (Блок 3)
- Container workspace image (Блок 4)
- Studio UI host list (Блок 5)
- Rate limiting на resolve-host (будущее)
