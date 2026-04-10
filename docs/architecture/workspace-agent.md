# Workspace Agent Architecture

> **Status:** Phase 0 — Contract Hardening
> **Last Updated:** 2026-03-21
> **ADRs:** [0017](../../public/kb-labs/docs/adr/0017-workspace-agent-architecture.md) (public), [0051–0054](../../platform/kb-labs-core/docs/adr/) (internal)

---

## Overview

Workspace Agent — процесс, который живёт **рядом с кодом** (ноутбук, контейнер, VM) и выполняет плагины локально. Platform services (LLM, RAG, state) проксируются обратно к платформе через Gateway.

```
┌─────────────────────────────────────────────────────────────┐
│  PLATFORM (Brain)                                            │
│  LLM, RAG, Workflow, State, Billing                         │
│       │                                                      │
│  Gateway (Spine) ──── WS ─────────────────────────────────┐ │
│       ▲                                                   │ │
│       │ adapter:call (reverse proxy)                      │ │
│  Adapter Call Handler → REST API                          │ │
└───────┼───────────────────────────────────────────────────┼─┘
        │ adapter:response                     call (exec)  │
┌───────▼───────────────────────────────────────────────────▼─┐
│  WORKSPACE AGENT (Hands)                                     │
│                                                              │
│  GatewayClient (WS)                                         │
│  ├── FilesystemHandler   (read/write/list/stat)             │
│  ├── ExecutionHandler    (plugin execution)                  │
│  ├── SearchHandler       (grep/glob)        [Phase 3]       │
│  ├── GitHandler          (status/diff/log)  [Phase 3]       │
│  └── ShellHandler        (exec)             [Phase 3]       │
│                                                              │
│  plugin-runtime + createProxyPlatform(GatewayTransport)     │
│  npm пакеты → нативный fs ✅                                │
│  ctx.llm → proxy → WS → Gateway → Brain ✅                  │
│                                                              │
│  /path/to/user/code                                          │
└──────────────────────────────────────────────────────────────┘
```

---

## Компоненты

| Компонент | Роль | Где живёт |
|-----------|------|-----------|
| **Brain** (Platform Core) | LLM inference, RAG, Workflow engine, State, Billing, Auth | Cloud / localhost |
| **Hands** (Workspace Agent) | Plugin execution, fs, git, shell, npm packages | Рядом с кодом |
| **Spine** (Gateway) | WS routing, capability discovery, dispatch, buffering | Cloud / localhost |
| **Face** (Clients) | Studio, CLI, REST API — только отображение | Cloud / localhost |

---

## Инварианты

Истинны **ВСЕГДА**, в любом deployment.

```
INV-1  Плагин выполняется ТАМ ЖЕ где файлы.
       npm пакеты работают нативно. Никогда не проксируем fs/child_process.

INV-2  Platform services доступны через ctx.*
       ctx.llm, ctx.cache, ctx.mind — direct call ИЛИ proxy.
       Автор плагина не знает и не решает.

INV-3  Gateway — единственная точка связи Brain ↔ Hands.
       Hands инициирует outbound WS (NAT-friendly).

INV-4  Один REST API, один Studio — разный RoutingBackend.
       Клиентский код не знает deployment mode.

INV-5  Безопасность в plugin-runtime, не в deployment.
       Permissions → governed.ts → shims → harden.ts.

INV-6  Workspace Agent = Brain-less Platform.
       Имеет plugin-runtime. НЕ имеет LLM/Qdrant/Billing.

INV-7  Workflow step имеет target.
       platform | workspace-agent | environmentId.
```

---

## Deployment'ы

### D1: Всё локально (инди-разработчик)

```
┌─────────────────────────────────────────┐
│  localhost                               │
│  Brain + Hands + Face = один процесс    │
│  Gateway не нужен                        │
│  ctx.llm = direct (свой API key)         │
│  fs = native                             │
└─────────────────────────────────────────┘
```

Уже работает. Ничего не меняется.

### D2: Код локально, платформа удалённо (SaaS)

```
Cloud                            Laptop
┌────────────────────┐           ┌────────────────────┐
│  Brain              │           │  Hands              │
│  REST API, Studio   │    WS     │  (Workspace Agent)  │
│  Workflow, Qdrant   │◀────────▶│                      │
│  LLM keys, Billing  │  Gateway  │  ExecutionHandler   │
│                     │           │  FilesystemHandler   │
│  RoutingBackend     │           │  plugin-runtime      │
│   → Gateway dispatch│           │  ctx.llm = proxy     │
└────────────────────┘           │                      │
                                 │  /Users/me/project   │
                                 └────────────────────┘
```

Потоки:
- **Plugin execution:** Studio → REST API → Gateway → WS → Workspace Agent
- **Reverse proxy:** Plugin → ctx.llm → GatewayTransport → WS → Gateway → REST API → LLM
- **Agent tools:** Agent Runner → Gateway → WS → Workspace Agent (fs/git/grep)

### D3: Код в remote контейнере (worktree/codespace)

```
Cloud (Brain)                    Cloud (Hands)
┌────────────────────┐           ┌────────────────────┐
│  REST API, Studio   │    WS     │  Container          │
│  Workflow, Qdrant   │◀────────▶│  Workspace Agent    │
│  LLM keys           │  Gateway  │  /workspace ← clone │
└────────────────────┘           └────────────────────┘
```

Тот же Workspace Agent, тот же код. Только внутри контейнера.

### D4: Гибрид (SaaS + cloud workspace)

```
Cloud (Brain)       Cloud (Hands-B)      Laptop (Hands-A)
┌──────────┐        ┌──────────┐         ┌──────────┐
│ REST API  │  WS    │Container │   WS    │Workspace │
│ Gateway   │◀──────▶│Workspace │        │Agent     │
│ LLM       │        │Agent     │◀──────▶│          │
└──────────┘        └──────────┘   GW    └──────────┘

ws-cloud-01: тяжёлые задачи (agent, CI)
ws-local-01: интерактивные команды (commit, review)
```

Routing config определяет кто получает какой execution.

---

## Матрица: компонент × deployment

```
                D1 (localhost)   D2 (SaaS+local)   D3 (cloud)    D4 (гибрид)
──────────────────────────────────────────────────────────────────────────────
Brain           localhost         Cloud              Cloud          Cloud
Hands           localhost         Laptop             Container      Both
Gateway         —                 Cloud              Cloud          Cloud
──────────────────────────────────────────────────────────────────────────────
Plugin exec     in-process        WS→Laptop          WS→Container   WS→either
ctx.llm         direct            proxy→Cloud        proxy→Cloud    proxy→Cloud
ctx.fs          native            native             native         native
──────────────────────────────────────────────────────────────────────────────
Gateway?        NO                YES                YES            YES
Reverse proxy?  NO                YES                YES            YES
```

---

## Протокол

### Существующий (Gateway → Host)

```
Gateway → Host:  call         {adapter, method, args}
Host → Gateway:  chunk        {data, index}
Host → Gateway:  result       {done: true}
Host → Gateway:  error        {code, message, retryable}
```

### Новый (Host → Gateway, reverse proxy)

```
Host → Gateway:  adapter:call       {adapter, method, args, timeout, context}
Gateway → Host:  adapter:response   {result}
Gateway → Host:  adapter:error      {code, message, retryable}
Gateway → Host:  adapter:chunk      {data, index}            [Phase 2+]
Host → Gateway:  adapter:cancel     {requestId}              [Phase 2+]
```

### Adapter Allowlist

| Adapter | Methods |
|---------|---------|
| `llm` | `complete`, `stream` |
| `cache` | `get`, `set`, `delete`, `clear` |
| `vectorStore` | `search`, `upsert`, `delete` |
| `embeddings` | `embed` |
| `storage` | `read`, `write`, `delete`, `list` |
| `state` | `get`, `set`, `delete` |

Всё вне allowlist → reject. Zod validation per method.

---

## Routing

### Execution Routing Config

```json
{
  "routing": {
    "default": "local",
    "fallbackPolicy": "platform-safe-only",
    "rules": [
      { "match": { "pluginClass": "workspace-mutation" }, "target": "workspace-agent", "fallback": "error" },
      { "match": { "pluginClass": "analysis-only" }, "target": "workspace-agent", "fallback": "local" },
      { "match": { "pluginId": "@kb-labs/mind-*" }, "target": "local" }
    ]
  }
}
```

### Fallback Policy

| Policy | Поведение |
|--------|-----------|
| `forbid` | Target offline → error. **Default для mutating.** |
| `platform-safe-only` | Только read-only может fallback. |
| `allow` | Любой plugin (dev only). |

### ExecutionTarget

```typescript
type ExecutionTarget =
  | { type: 'platform' }
  | { type: 'workspace-agent'; workspaceId?; hostId?; hostSelection?; repoFingerprint? }
  | { type: 'environment'; environmentId: string };
```

---

## Delivery Semantics

### Idempotency

- **Mutating plugins** → `at-most-once`. Execution journal на host: `requestId → started|completed|result`.
- **Read-only plugins** → retry allowed.

### Timeout Budget

```
Execution(120s) → adapter:call(remainingBudget) → adapter:call(remainingBudget) → ...
```

Каждый adapter:call получает оставшийся бюджет. Общий timeout → AbortSignal → всё abort.

### Reconnect

- WS disconnect → reject all pending adapter calls → plugin handler fails
- Gateway cancels executions by host
- Reconnect → re-register capabilities
- NO replay pending calls

---

## Workspace Identity

```
namespaceId       Tenant scope
hostId            Unique Workspace Agent ID (stable across restarts)
workspaceId       Logical workspace (path or repo)
environmentId     Container ID
repoFingerprint   Hash(origin URL + root commit)
hostType          'local' | 'cloud'
```

Hello message включает workspace + plugin inventory для routing.

---

## Security

### Уровни enforcement

```
              Manifest perms    Shims/Patches     Process isolation
in-process    ✅ governed.ts   ✅ fs/fetch/env    ❌ same process
subprocess    ✅ governed.ts   ✅ + harden.ts     ✅ child process
container     ✅ governed.ts   ✅ + harden.ts     ✅ + namespace/cgroup
```

Один permission model, одни shims. Deployment добавляет изоляцию, но не заменяет runtime enforcement.

### Plugin Provenance

- Phase 1-2: strict path resolution, `..` blocked, `pluginId → local path` allowlist
- Phase 5+: signed descriptors, registry-based resolution

---

## Error Flows

### Workspace Agent offline

```
CLI → REST API → RoutingBackend → Gateway → "Host not connected"
  → fallbackPolicy check
  → forbid: WORKSPACE_AGENT_OFFLINE → "Запустите kb workspace start"
  → allow: fallback to local
```

### Plugin not found

```
Gateway → WS → Workspace Agent → LocalPluginResolver → not found
  → WS error → Gateway → REST API → "Plugin @kb-labs/commit не найден"
```

### adapter:call timeout

```
Plugin → ctx.llm.complete() → GatewayTransport → WS → Gateway → REST API → LLM (hangs)
  → timeout → reject → plugin fails → ExecutionHandler returns error
  → "LLM вызов не завершился за N секунд"
```

### Disconnect mid-execution

```
WS drops → GatewayClient.rejectAllPending(TransportError)
  → plugin handler fails → journal: completed(error)
  → Gateway: executionRegistry.cancelByHost()
  → Platform: "Соединение потеряно. Результат неизвестен."
```

---

## Фазы реализации

| Phase | Что | Ключевые deliverables |
|-------|-----|-----------------------|
| **0** | Contract Hardening + Docs | ADRs (done), эта карта (done), Zod schemas |
| **1** | Bidirectional WS Protocol | `adapter:call/response/error`, `GatewayTransport`, REST API endpoint, `AdapterRegistry` |
| **2** | ExecutionHandler + Daemon | `ExecutionHandler`, `LocalPluginResolver`, daemon wiring, error codes |
| **3** | Agent Tools (Cursor-модель) | `IWorkspaceProvider`, SearchHandler, GitHandler, ShellHandler |
| **4** | Subprocess mode | Sandboxed execution, `runInSubprocess` + GatewayTransport chain |
| **5** | Rename + Polish | CLI commands (`kb workspace *`), config validation, health check |

---

## Ключевые файлы

### Существующие (модификация)

| Файл | Роль |
|------|------|
| `gateway-contracts/src/protocol.ts` | +adapter message schemas |
| `host-agent-core/src/ws/gateway-client.ts` | +sendAdapterCall, +pending, +adapter:response |
| `host-agent-app/src/daemon.ts` | +GatewayTransport, +ExecutionHandler |
| `gateway-app/src/hosts/ws-handler.ts` | +adapter:call routing |
| `host-agent-contracts/src/config.ts` | +execution config |
| `plugin-execution-factory/src/isolated-backend.ts` | +target.type routing |
| `plugin-execution-factory/src/types.ts` | +ExecutionTarget |
| `plugin-execution-factory/src/errors.ts` | +error codes |

### Новые

| Файл | Роль |
|------|------|
| `host-agent-core/src/transport/gateway-transport.ts` | ITransport через WS |
| `host-agent-core/src/handlers/execution-handler.ts` | Plugin execution + journal |
| `host-agent-core/src/handlers/local-plugin-resolver.ts` | pluginId → local path |
| `gateway-app/src/hosts/adapter-call-handler.ts` | Gateway → REST API forwarder |
| `rest-api/routes/internal/adapter-call.ts` | Endpoint + AdapterRegistry |
| `rest-api/adapter-registry.ts` | Method allowlist + Zod schemas |

### Переиспользуемые (без изменений)

| Файл | Что |
|------|-----|
| `plugin-runtime/src/sandbox/runner.ts` | `runInProcess()`, `runInSubprocess()` |
| `plugin-runtime/src/context/context-factory.ts` | `createPluginContextV3()` |
| `core-runtime/src/proxy/create-proxy-platform.ts` | `createProxyPlatform({ transport })` |
| `core-runtime/src/transport/transport.ts` | `ITransport`, `PendingRequest`, `TransportError` |
| `plugin-runtime/src/platform/governed.ts` | Permission enforcement |
| `plugin-runtime/src/runtime/fs-shim.ts` | Sandbox fs |
| `plugin-runtime/src/sandbox/harden.ts` | Subprocess hardening |
| `plugin-contracts/src/ui.ts` | `noopUI` |

---

## References

- [ADR-0017: Workspace Agent Architecture](../../public/kb-labs/docs/adr/0017-workspace-agent-architecture.md) — публичная архитектура
- [ADR-0051: Bidirectional Gateway Protocol](../../platform/kb-labs-core/docs/adr/0051-bidirectional-gateway-protocol.md)
- [ADR-0052: Execution Routing & Fallback](../../platform/kb-labs-core/docs/adr/0052-execution-routing-and-fallback.md)
- [ADR-0053: Delivery Semantics](../../platform/kb-labs-core/docs/adr/0053-delivery-semantics.md)
- [ADR-0054: Workspace Identity Model](../../platform/kb-labs-core/docs/adr/0054-workspace-identity-model.md)
- [Gateway Execution Architecture](./gateway-execution-architecture.md) — предыдущая архитектура
- [Full RFC / Plan](../../.claude/plans/whimsical-kindling-crayon.md)
