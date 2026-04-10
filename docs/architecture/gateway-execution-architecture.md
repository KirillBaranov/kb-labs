# Gateway & Execution Architecture

> **Status:** Experiment — Phase 1 complete, Phase 2 not started
> **Last Updated:** 2026-03-15
> **Context:** First cloud migration experiment. Goal: run plugins/agents remotely, CLI stays local.

---

## Vision

KB Labs CLI выполняет плагины и агентов **удалённо** — на облачных машинах или выделенных воркерах. CLI не знает где физически запускается код. Gateway — единая точка входа и маршрутизации.

```
CLI (локально) → Gateway → Host Agent (где угодно) → выполняет плагин
```

Это позволяет:
- Запускать тяжёлые агентов в облаке, не нагружая локальную машину
- Иметь несколько воркеров и балансировать между ними
- Изолировать выполнение (каждый tenant — свой host)
- Работать с одного CLI с нескольких машин

---

## Текущая Архитектура (Phase 1)

### Компоненты

```
┌─────────────────────────────────────────────────────────────────┐
│  CLI (kb-labs-cli)                                               │
│                                                                  │
│  resolveTransport()                                             │
│    1. ~/.kb/agent.sock живой?  → HostAgentTransport (IPC)       │
│    2. credentials.json есть?   → HttpSseGatewayTransport (HTTP) │
│    3. иначе                    → Error "run kb auth login"      │
└───────────┬──────────────────────────┬──────────────────────────┘
            │ IPC (unix socket)        │ HTTP
            ▼                         ▼
┌───────────────────────┐   ┌─────────────────────────────────────┐
│  Host Agent daemon    │   │  Gateway :4000 (kb-labs-gateway)    │
│  (~/.kb/agent.sock)   │   │                                     │
│                       │   │  Auth:   JWT (15min) + refresh      │
│  - TokenManager       │   │  Routes: /auth/*, /hosts/*, /health │
│  - GatewayClient (WS) │   │          POST /api/v1/execute       │
│  - IpcServer          │   │                                     │
│  - FilesystemHandler  │   │  Proxy:  /api/v1/* → REST :5050    │
│                       │   │          /api/exec/* → Workflow :7778│
└───────┬───────────────┘   └──────────────┬──────────────────────┘
        │                                  │
        │ POST /api/v1/execute             │ WebSocket
        └─────────────────────────────────►│
                                           │ call('execution', ...)
                                           ▼
                                   Host Agent (WS client)
                                   handler('execution') ← НЕ РЕАЛИЗОВАН ❌
```

### Что реализовано

| Компонент | Статус | Пакет |
|-----------|--------|-------|
| Gateway сервер (Fastify) | ✅ | `kb-labs-gateway/apps/gateway-app` |
| JWT аутентификация | ✅ | `kb-labs-gateway/packages/gateway-auth` |
| WebSocket хендшейк (hosts/clients) | ✅ | `gateway-ws.ts` |
| Dispatcher (маршрутизация по namespaceId) | ✅ | `hosts/dispatcher.ts` |
| POST /api/v1/execute (ndjson streaming) | ✅ | `execute/routes.ts` |
| Execution registry + cancellation | ✅ | `execute/execution-registry.ts` |
| Host Agent daemon | ✅ | `kb-labs-host-agent/apps/host-agent-app` |
| Host Agent IPC сервер | ✅ | `host-agent-core/src/ipc` |
| Host Agent → Gateway tunnel | ✅ | `gateway-client.ts` → `executeTunnel()` |
| FilesystemHandler | ✅ | `kb-labs-host-agent/packages/host-agent-fs` |
| CLI transport resolver | ✅ | `cli-core/src/gateway/transport-resolver.ts` |

### Что не реализовано

| Компонент | Почему нужен |
|-----------|--------------|
| `execution` handler в host-agent | Gateway вызывает его через WS — без него `UNKNOWN_ADAPTER` |
| Transport resolver учитывает `execution.mode` | Сейчас всегда идёт через IPC если сокет жив, ломая `in-process` режим |
| Персистентный hosts registry | Сейчас in-memory — перезапуск Gateway = потеря хостов |

---

## Потоки данных

### IPC путь (host-agent запущен локально)

```
pnpm kb agent:run
    │
    ▼
resolveTransport() → ~/.kb/agent.sock живой → HostAgentTransport
    │
    │ IPC (unix socket)
    ▼
IpcServer.handleExecute()
    │
    │ executeTunnel()
    ▼
POST http://localhost:4000/api/v1/execute
    Bearer: <machine JWT>
    Body: { pluginId, handlerRef, exportName, input }
    │
    ▼
Gateway: auth middleware → authContext ✅
    │
    ▼
globalDispatcher.firstHost(namespaceId)
    → находит host_89dcd... (online)
    │
    │ WebSocket message: { type: 'call', adapter: 'execution', ... }
    ▼
Host Agent GatewayClient.onMessage()
    → handlers.get('execution') → undefined → UNKNOWN_ADAPTER ❌
```

### HTTP путь (host-agent не запущен)

```
pnpm kb agent:run
    │
    ▼
resolveTransport() → сокет мёртв → HttpSseGatewayTransport
    │
    │ POST http://localhost:4000/api/v1/execute
    │ Bearer: <user JWT из credentials.json>
    ▼
Gateway: auth middleware → authContext ✅
    │
    ▼
globalDispatcher.firstHost(namespaceId)
    → нет онлайн хостов → 503 "No host connected"
```

---

## Известные баги

### 1. Transport resolver игнорирует `execution.mode`

**Файл:** `kb-labs-cli/packages/cli-core/src/gateway/transport-resolver.ts:30`

```typescript
// Сейчас: всегда IPC если сокет жив
if (await isSocketAlive(HOST_AGENT_SOCKET)) {
  return new HostAgentTransport(HOST_AGENT_SOCKET);
}
```

При `execution.mode = "in-process"` в `kb.config.json` CLI должен выполнять плагины локально, не через gateway. Сейчас — если host-agent запущен, всегда идёт через IPC → gateway → `UNKNOWN_ADAPTER`.

### 2. Auth middleware и PROXY_PREFIXES (исправлено 2026-03-15)

Оригинальный middleware содержал `PROXY_PREFIXES = ['/api/']` skip — gateway-owned route `/api/v1/execute` пропадал без authContext → 401.

Исправление: удалён PROXY_PREFIXES skip. Proxy (`@fastify/http-proxy`) регистрируется до `gatewayRoutes` scope и перехватывает upstream-запросы раньше — skip был избыточен.

### 3. Hosts registry in-memory

**Файл:** `kb-labs-gateway/apps/gateway-app/src/hosts/registry.ts`

Registry хранится в ICache (InMemoryCache). Перезапуск Gateway = все хосты отключены, нужно переподключение. Видно в `/hosts` — десятки `degraded` runtime-* хостов от старых экспериментов, которые уже не существуют.

### 4. clientSecret в открытом виде

**Файл:** `~/.kb/agent.json`

`clientSecret` хранится plaintext. Для dev — приемлемо, для prod — нет.

---

## Plan доработки

### Phase 2: Замкнуть execution loop (приоритет: высокий)

**Цель:** `pnpm kb agent:run` работает через gateway с host-agent.

**Задачи:**

**2.1** Реализовать `execution` handler в host-agent

```typescript
// daemon.ts — добавить после filesystem handler
import { PluginExecutionHandler } from '@kb-labs/host-agent-execution';

const executionHandler = new PluginExecutionHandler({
  workspacePaths: config.workspacePaths,
  pluginRegistry: ..., // загрузить плагины из манифестов
});
gatewayClient.registerHandler('execution', (call) => executionHandler.handle(call));
```

Нужен новый пакет `@kb-labs/host-agent-execution` (по аналогии с `host-agent-fs`).

Handler должен:
- Принять `{ pluginId, handlerRef, exportName, input, executionId }`
- Загрузить плагин из локального реестра
- Выполнить handler
- Стримить события обратно через WS (`execution:start`, `execution:event`, `execution:done`)

**2.2** Починить transport resolver

```typescript
// transport-resolver.ts
export async function resolveTransport(config: ExecutionConfig): Promise<IGatewayClient> {
  // in-process mode — не идём через gateway
  if (config.mode === 'in-process') {
    return new InProcessTransport();
  }

  // remote mode — IPC или HTTP
  if (await isSocketAlive(HOST_AGENT_SOCKET)) {
    return new HostAgentTransport(HOST_AGENT_SOCKET);
  }
  ...
}
```

**2.3** Добавить `InProcessTransport`

Для `mode: in-process` — выполняет плагин прямо в процессе CLI, не ходя на gateway. Это текущий де-факто режим, нужно сделать его явным.

---

### Phase 3: Стабилизация Gateway (приоритет: средний)

**3.1** Персистентный hosts registry

Хранить регистрацию хостов в SQLite (уже есть в gateway-app). При переподключении хоста — восстанавливать запись. Убрать stale записи через TTL.

**3.2** Фильтрация `/hosts` по namespaceId

```typescript
// routes.ts — сейчас возвращает всех
const hosts = await registry.list(auth.namespaceId); // уже есть!
// но registry.list() не фильтрует — починить в registry.ts
```

**3.3** Token refresh в CLI

Сейчас `credentials.json` хранит access token (15 мин). При долгой сессии — протухает. Нужен auto-refresh через `refreshToken`.

---

### Phase 4: Remote host (приоритет: низкий, "облако")

**Цель:** host-agent запущен на облачной машине, CLI — локально.

**4.1** Docker образ для host-agent

```dockerfile
FROM node:20-slim
COPY dist/ /app/dist/
CMD ["node", /app/dist/index.js]
```

**4.2** `kb agent register --gateway-url=https://my-gateway.com`

Регистрирует host-agent на удалённом gateway, сохраняет credentials.

**4.3** TLS для Gateway

Сейчас Gateway работает только на HTTP. Для remote нужен HTTPS (nginx reverse proxy + Let's Encrypt).

**4.4** Изоляция воркеров

Каждый вызов `execution` — в отдельном процессе/контейнере. Сейчас нет изоляции между выполнениями.

---

## Быстрые победы (можно сделать сейчас)

| Задача | Сложность | Эффект |
|--------|-----------|--------|
| Починить transport resolver (2.2) | Малая | `in-process` перестаёт ломаться при запущенном host-agent |
| Добавить InProcessTransport (2.3) | Малая | Явный in-process режим |
| Фильтрация `/hosts` по namespace (3.2) | Малая | Чистый список хостов |
| Реализовать execution handler (2.1) | Средняя | Полный IPC путь работает |
| Token refresh в CLI (3.3) | Средняя | Долгие сессии не ломаются |
