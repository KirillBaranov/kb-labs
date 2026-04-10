---
plan_id: "2026-03-21-persistent-host-registry"
created_at: "2026-03-21"
status: "draft"
priority: "high"
estimated_duration: "2-3h"
tags: ["gateway", "host-registry", "persistence", "sqlite"]
---

# Persistent Host Registry

## Цель

Gateway запоминает зарегистрированные hosts между рестартами. Сейчас всё в `ICache` (in-memory) — при рестарте hosts теряются, agent'ы должны перерегистрироваться.

## Текущее состояние

- `HostRegistry` в `gateway-app/src/hosts/registry.ts` — полный API (register, setOnline/Offline, heartbeat, list, get, resolveToken, ensureRegistered)
- Хранит в `ICache` (volatile, key-value)
- `HostDescriptor` schema в `gateway-contracts/src/host.ts`
- Gateway bootstrap: `createServiceBootstrap()` → `platform.cache` → `HostRegistry`
- REST: `POST /hosts/register`, `GET /hosts` — уже есть

## Принципы

1. **Абстракция** — `IHostStore` interface, реализация через `ISQLDatabase`
2. **Обратная совместимость** — `HostRegistry` API не меняется
3. **Cache = hot layer** — `ICache` остаётся для быстрых reads (online status, connections)
4. **Store = cold layer** — `ISQLDatabase` для durable state (registration, capabilities, metadata)
5. **Без хардкода** — store инжектится через конструктор

## Архитектура

```
HostRegistry (координатор)
├── IHostStore (persistence)     ← NEW: SQLite-backed
│   ├── save(descriptor)
│   ├── get(hostId, namespaceId)
│   ├── list(namespaceId)
│   ├── delete(hostId, namespaceId)
│   └── saveToken(token, hostId, namespaceId)
└── ICache (hot state)           ← существующий
    ├── online/offline status
    ├── connections[]
    └── lastSeen (heartbeat)
```

Write path: `register()` → store.save() + cache.set()
Read path: `get()` → cache.get() ?? store.get() → cache.set()
Online/offline: только cache (transient state)
Startup: `restore()` → store.list() → cache warm-up (all hosts as offline)

## Шаги

### Phase 1: Contracts

**1.1** `IHostStore` interface в `gateway-contracts`
- `save(descriptor: HostDescriptor): Promise<void>`
- `get(hostId: string, namespaceId: string): Promise<HostDescriptor | null>`
- `list(namespaceId: string): Promise<HostDescriptor[]>`
- `listAll(): Promise<HostDescriptor[]>`
- `delete(hostId: string, namespaceId: string): Promise<boolean>`
- `saveToken(token: string, hostId: string, namespaceId: string): Promise<void>`
- `resolveToken(token: string): Promise<{hostId: string, namespaceId: string} | null>`
- `deleteToken(token: string): Promise<void>`

**1.2** Расширить `HostDescriptorSchema` — добавить `createdAt`, `updatedAt`

### Phase 2: SQLite Store

**2.1** `SqliteHostStore` в `gateway-core` implements `IHostStore`
- Миграция: `hosts` table (hostId PK, namespaceId, name, capabilities JSON, hostType, metadata JSON, createdAt, updatedAt)
- Миграция: `host_tokens` table (token PK, hostId, namespaceId, createdAt)
- Auto-migrate on construction
- Использует `ISQLDatabase` из platform

### Phase 3: Registry refactor

**3.1** `HostRegistry` конструктор: `(cache: ICache, store: IHostStore)`
- `register()` → store.save() + store.saveToken() + cache.set()
- `get()` → cache miss → store.get() → cache warm
- `list()` → store.list() (authoritative) + cache enrich (online status)
- `resolveToken()` → cache ?? store
- `setOnline/setOffline/heartbeat` → cache only (transient)

**3.2** `restore()` method — вызывается при startup
- store.listAll() → cache warm-up (все hosts как offline)
- store tokens → cache warm-up

### Phase 4: Bootstrap wiring

**4.1** `bootstrap.ts` — inject SQLite store
- `platform.getAdapter('sqlDatabase')` или fallback к in-memory
- `new SqliteHostStore(db)` → `new HostRegistry(cache, store)`
- `await registry.restore()` при startup

**4.2** `createServer()` — принимает `HostRegistry` вместо создания внутри

### Phase 5: REST API routes

**5.1** Host management routes в Gateway
- `GET /hosts` — уже есть, обогатить (online status из cache)
- `GET /hosts/:hostId` — detail view
- `DELETE /hosts/:hostId` — deregister (remove from store + cache)
- `POST /hosts/:hostId/heartbeat` — explicit heartbeat

### Phase 6: Health tracking

**6.1** Stale host cleanup
- Background interval: проверять `lastSeen`, помечать stale hosts
- Configurable TTL (default: 5 min offline → stale)
- Stale hosts не удаляются из store, только status = 'stale'

### Phase 7: Tests + QA

**7.1** Unit tests
- `SqliteHostStore` — CRUD, token resolution, migrations
- `HostRegistry` с mock store — cache/store interaction
- Restore flow — startup warm-up

**7.2** Build + QA
- `pnpm run build` в gateway
- `pnpm qa` — no regressions

## Файлы (ожидаемые изменения)

| Файл | Действие |
|------|----------|
| `gateway-contracts/src/host.ts` | Extend schema + IHostStore interface |
| `gateway-contracts/src/index.ts` | Re-export IHostStore |
| `gateway-core/src/stores/sqlite-host-store.ts` | NEW: SQLite implementation |
| `gateway-core/src/index.ts` | Re-export SqliteHostStore |
| `gateway-app/src/hosts/registry.ts` | Refactor: accept IHostStore |
| `gateway-app/src/bootstrap.ts` | Wire SQLite store |
| `gateway-app/src/server.ts` | Accept registry from bootstrap |
| `gateway-core/src/__tests__/sqlite-host-store.test.ts` | NEW: store tests |
| `gateway-app/src/__tests__/host-registry.test.ts` | NEW: registry tests |

## Не входит в scope

- Multi-namespace routing (Блок 2)
- Host selection strategies (Блок 2)
- Reconnect / session resume (Блок 3)
- Container workspace (Блок 4)
