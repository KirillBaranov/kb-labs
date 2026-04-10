# Execution Isolation Architecture

> Status: **IN PROGRESS** — базовый dispatch реализован, Docker pending
> Last updated: 2026-03-05

---

## 1. Контекст и цели

### Что хотим

Любой хост (workflow, CLI, REST API, агент) может выполнить plugin handler:
- локально — быстро, без изоляции
- в изолированном окружении — контейнер, VM, pod, sandbox

При этом **хост не знает** как именно это происходит. Он только говорит:

```
executionBackend.execute(handlerRef, input, { environmentId?, permissions? })
```

### Инварианты языка и рантайма

**Plugin API и handlers — всегда Node.js/TypeScript.** Это канон платформы, не меняется.

Но внутри handler может запускать произвольный код на любом языке через `ctx.platform.shell.exec()`:

```
Plugin handler (Node.js)         ← API платформы, всегда TS
  └── shell.exec('go', ['run', './scripts/migrate.go'])   ← любой язык
  └── shell.exec('python', ['./scripts/analyze.py'])
  └── shell.exec('./bin/my-rust-tool', ['--input', '...'])
```

**Почему это безопасно:** внешний процесс видит только то что смонтировано в workspace с учётом прав. Если `src/secrets/` не в permissions — скрипт на go его не увидит так же как и Node.js код.

**Что это означает для runtime server:** он всегда запускает Node.js handler (`node /workspace/...`). Поддержка других языков для самих handlers — отдельное решение в будущем, сейчас не нужна.

**Runtime server в образе** должен иметь только Node.js. Дополнительные рантаймы (go, python, etc) — ответственность плагина через декларацию в манифесте:

```json
{
  "environment": {
    "image": "my-plugin-image:1.0",   // образ с нужными рантаймами
    "requires": ["go", "python3"]     // платформа проверяет наличие
  }
}
```

Либо через базовый образ платформы с набором предустановленных рантаймов.

### Сценарии которые должны работать

| Сценарий | Isolation | Environment | Workspace |
|----------|-----------|-------------|-----------|
| CLI команда разработчика | relaxed | нет | нет |
| Workflow job без изоляции | relaxed | нет | нет |
| Workflow job с workspace | balanced | нет | localfs |
| Workflow job в контейнере | strict | Docker | localfs mount |
| Агент с доступом к S3 | strict | Docker/K8s | S3 |
| CI/CD в облаке | strict | K8s pod | Git snapshot |

---

## 2. Слои и ответственности

```
┌─────────────────────────────────────────────┐
│  Host (Workflow / CLI / Agent / REST)        │
│  — знает ЧТО выполнить и С КАКИМИ ПРАВАМИ  │
│  — управляет lifecycle env+workspace        │
└──────────────────┬──────────────────────────┘
                   │ execute(handlerRef, input, { environmentId, permissions })
┌──────────────────▼──────────────────────────┐
│  ExecutionBackend                            │
│  — диспетчер: local vs remote               │
│  — не знает про workspace/snapshot          │
│  — не знает про Docker/K8s                  │
└──────────┬───────────────────┬──────────────┘
           │ local             │ environmentId present
┌──────────▼──────┐   ┌────────▼──────────────┐
│ LocalBackend     │   │ RemoteBackend          │
│ in-process /     │   │ — резолвит endpoint   │
│ subprocess /     │   │   по environmentId    │
│ worker-pool      │   │ — передаёт через      │
└─────────────────┘   │   IExecutionTransport  │
                       └────────┬──────────────┘
                                │
                       ┌────────▼──────────────┐
                       │ IExecutionTransport    │
                       │ (адаптер)              │
                       │ — TCP / gRPC / socket  │
                       └────────┬──────────────┘
                                │
                       ┌────────▼──────────────┐
                       │ Runtime Server         │
                       │ (внутри окружения)     │
                       │ — получает request     │
                       │ — запускает handler    │
                       │ — стримит stdout/stderr│
                       └───────────────────────┘
```

### Environment
**Отвечает за:** общее окружение выполнения (контейнер, pod, VM, sandbox)
**Знает:** как поднять, проверить статус, уничтожить
**Не знает:** что внутри выполняется, какой код
**Интерфейс:** `IEnvironmentProvider` — `create()`, `getStatus()`, `destroy()`

### Workspace
**Отвечает за:** рабочую область — что будет доступно внутри окружения
**Знает:** как материализовать (localfs, S3, git clone), как приаттачить к окружению
**Не знает:** что за окружение, как оно устроено
**Интерфейс:** `IWorkspaceProvider` — `materialize()`, `attach()`, `release()`

### Snapshot
**Отвечает за:** снимок репо/кода который монтируется в workspace
**Знает:** как зафиксировать версию кода в конкретный момент
**Не знает:** про окружение и выполнение
**Интерфейс:** `ISnapshotProvider` — `create()`, `restore()`, `delete()`

### ExecutionBackend
**Отвечает за:** диспетчеризацию выполнения
**Знает:** есть ли `environmentId` → local или remote
**Не знает:** Docker/K8s/VM, workspace, snapshot
**Интерфейс:** `IExecutionBackend` — `execute(request)`

### IExecutionTransport
**Отвечает за:** канал связи между backend и runtime сервером в окружении
**Знает:** как установить соединение, передать request, получить stream
**Не знает:** что за окружение, что за handler
**Интерфейс:** `IExecutionTransport` — `connect(environmentId)`, `send(request)`, `stream()`

---

## 3. Flow по шагам

### isolation: relaxed (текущий, работает)

```
1. Host: execute(handlerRef, input)         // нет environmentId
2. ExecutionBackend: → LocalBackend
3. LocalBackend: fork/import handler
4. Handler выполняется на хосте
5. Результат возвращается
```

### isolation: balanced (текущий, работает)

```
1. Host: workspaceProvider.materialize()    // создаёт директорию
2. Host: execute(handlerRef, input, { workspaceId })
3. ExecutionBackend: → LocalBackend
4. LocalBackend: резолвит workspaceId → rootPath
5. Handler выполняется с cwd = rootPath
6. Host: workspaceProvider.release()
```

### isolation: strict (ПРОЕКТИРУЕТСЯ)

```
1. Host: workspaceProvider.materialize({ sourceRef: monorepoRoot })
   → WorkspaceDescriptor { workspaceId, rootPath }

2. Host: environmentProvider.create({ workspacePath: rootPath, permissions })
   → EnvironmentDescriptor { environmentId, endpoints }
   → Внутри: docker run -v rootPath:/workspace --network=... node:20 runtime-server
   → runtime-server стартует, слушает на порту, регистрирует endpoint

3. Host: workspaceProvider.attach({ workspaceId, environmentId })
   → записывает связь (для cleanup и статуса)

4. Host: execute(handlerRef, input, { environmentId, permissions })

5. ExecutionBackend: environmentId present → RemoteBackend

6. RemoteBackend:
   a. резолвит endpoint контейнера по environmentId
   b. ремаппит handlerRef: /host/monorepo/... → /workspace/...
   c. IExecutionTransport.connect(endpoint)
   d. отправляет { handlerRef: '/workspace/...', input, context, permissions }

7. Runtime Server внутри контейнера:
   a. получает request
   b. загружает handler: require('/workspace/...')
   c. создаёт platform proxy (логи/кэш идут обратно через transport)
   d. выполняет handler(input, ctx)
   e. стримит stdout/stderr
   f. возвращает result

8. Host: workspaceProvider.release() + environmentProvider.destroy()
```

---

## 4. Permissions модель

### Источники прав (в порядке приоритета)

```
plugin manifest        — максимум что плагин может попросить
    ∩
workflow/task yaml     — что разрешил вызывающий
    ∩
platform policy        — глобальные ограничения платформы
    =
effective permissions  — передаются в environment.create() и в handler context
```

### Декларация в манифесте плагина

```json
{
  "permissions": {
    "fs": {
      "read": ["src/", "config/", "package.json"],
      "write": ["dist/", ".cache/"]
    },
    "network": ["api.github.com", "registry.npmjs.org"],
    "shell": ["git", "npm", "node"],
    "platform": ["logger", "cache"]
  }
}
```

**Ключевой инвариант: workspace собирает ТОЛЬКО то, что плагин явно запросил.**

Если плагин не указал `src/secrets/` в `permissions.fs.read` — эта директория НЕ монтируется в контейнер вообще. Не "монтируется read-only", а физически отсутствует. Это касается и скриптов запускаемых через `shell.exec()` — они видят только смонтированное.

```
manifest.permissions.fs.read = ["src/", "config/"]
    → workspace собирает только src/ и config/
    → всё остальное (docs/, tests/, .env, secrets/) НЕ попадает в контейнер
```

### Декларация в workflow YAML

```yaml
jobs:
  build:
    permissions:
      network: false       # запрещаем даже если плагин просит
      shell: ["git"]       # сужаем до минимума
      fs:
        read: ["src/"]     # ещё сужаем — только src/, без config/
```

### Трансляция в environment constraints

```
permissions.network = false    → docker run --network none
permissions.network = [urls]   → egress proxy / firewall rules
permissions.fs.read = [paths]  → mount только этих путей (ro) в /workspace/
permissions.fs.write = [paths] → mount этих путей (rw) в /workspace/
permissions.fs = "none"        → нет дополнительных маунтов
permissions.shell = [cmds]     → передаётся в runtime-server как allowlist
```

### Сборка workspace по манифесту

```
1. WorkspaceProvider.materialize() получает effectivePermissions
2. Из permissions.fs.read/write извлекает список путей
3. Собирает workspace ТОЛЬКО из указанных путей:
   - Либо selective copy (cp src/ config/ → workspace/)
   - Либо selective mount (bind mount конкретных директорий)
4. Всё что не указано — не существует внутри workspace
5. Write-пути монтируются rw, read-пути — ro
```

---

## 5. IExecutionTransport (адаптер)

### Интерфейс

```typescript
interface IExecutionTransport {
  // Установить соединение с runtime-server в окружении
  connect(environmentId: string, endpoint: EnvironmentEndpoint): Promise<TransportChannel>;
}

interface TransportChannel {
  // Отправить запрос на выполнение, получить stream результата
  execute(request: RemoteExecutionRequest): Promise<RemoteExecutionStream>;
  close(): Promise<void>;
}

interface RemoteExecutionStream {
  // Стриминг stdout/stderr
  on(event: 'stdout', handler: (chunk: string) => void): void;
  on(event: 'stderr', handler: (chunk: string) => void): void;
  on(event: 'result', handler: (result: ExecutionResult) => void): void;
  on(event: 'error', handler: (error: Error) => void): void;
}
```

### Варианты адаптеров

| Адаптер | Транспорт | Когда использовать |
|---------|-----------|-------------------|
| `adapters-transport-local` | fork + unix socket | LocalBackend, текущий subprocess |
| `adapters-transport-tcp` | TCP + JSON protocol | Docker на том же хосте |
| `adapters-transport-grpc` | gRPC | production, K8s, стриминг |
| `adapters-transport-http` | HTTP + SSE | простые сценарии, serverless |

### Конфигурация

```json
{
  "platform": {
    "adapters": {
      "executionTransport": "@kb-labs/adapters-transport-tcp"
    },
    "adapterOptions": {
      "executionTransport": {
        "connectTimeoutMs": 5000,
        "requestTimeoutMs": 300000
      }
    }
  }
}
```

---

## 6. Runtime Server (внутри окружения)

Запускается как `defaultCommand` при `environment.create()`. Принимает запросы от транспорта и выполняет handlers.

### Ответственности

- Слушать входящие соединения от транспорта
- Резолвить handlerRef → файл внутри /workspace
- Создавать platform proxy (логи, кэш — через обратный канал транспорта)
- Выполнять handler в sandbox с переданными permissions
- Стримить stdout/stderr обратно
- Возвращать результат или ошибку

### Пакет

`@kb-labs/plugin-runtime-server` — отдельный entrypoint, входит в базовый образ.

### Образ

```dockerfile
FROM node:20-alpine
COPY --from=monorepo /workspace /workspace  # или mount
RUN npm install -g @kb-labs/plugin-runtime-server
CMD ["kb-runtime-server", "--port", "9000"]
```

---

## 7. Открытые вопросы

### Q1: Как runtime-server регистрирует свой endpoint?

**Вариант A:** Фиксированный порт в образе (например 9000), `environmentProvider.create()` знает про него
**Вариант B:** Runtime-server получает callback URL при старте через env var, регистрирует себя
**Вариант C:** `EnvironmentDescriptor.endpoints[]` заполняется при `create()` на основе конфига образа

Предпочтительно: **A** для начала — просто, потом можно усложнить.

### Q2: Как platform proxy работает из контейнера?

Handler внутри контейнера вызывает `ctx.platform.logger.info()`. Это должно:
1. Сериализоваться в сообщение
2. Уйти через transport обратно к хосту
3. Хост записывает в реальный logger

По сути двунаправленный RPC поверх того же транспортного канала.

**Подводный камень:** latency. Каждый вызов = round-trip. Нужен local буфер + batch flush.

### Q3: Node modules в контейнере

Монорепо монтируется как `/workspace`. Там есть `node_modules` (гигабайты).
**Вариант A:** монтировать всё — просто, работает, но медленно при первом mount
**Вариант B:** монтировать только `src/` + `dist/`, node_modules в образе
**Вариант C:** volume cache для node_modules отдельно

Начать с **A**, оптимизировать позже.

### Q4: Secrets

Как передавать секреты в handler безопасно?
**Вариант A:** env vars при `create()` — просто, но утекают в `docker inspect`
**Вариант B:** через транспортный канал при выполнении — не персистируются
**Вариант C:** secrets mount (Docker secrets / K8s secrets)

Предпочтительно: **B** — secrets передаются только в момент выполнения, не хранятся в контейнере.

### Q5: Snapshot vs live монорепо

Два параллельных job'а шарят один workspace если используют live монорепо.
Snapshot должен делать copy-on-write или полный clone.
**Решение:** `ISnapshotProvider` создаёт immutable snapshot перед `materialize()`. Пока не реализовано — используем live mount с осознанием ограничения.

---

## 8. Найденные изъяны (Architecture Review)

### 8.1 ExecutionRequest не содержит permissions

**Проблема:** Текущий `ExecutionRequest` не имеет поля `permissions`. RemoteBackend не может передать ограничения в runtime-server.

**Решение:** Добавить `permissions?: EffectivePermissions` в `ExecutionRequest`. Backend прокидывает их в transport → runtime-server.

### 8.2 Readiness probe для runtime-server

**Проблема:** `environmentProvider.create()` запускает контейнер, но runtime-server внутри стартует асинхронно. RemoteBackend может попытаться подключиться до готовности.

**Решение:** RemoteBackend делает retry с exponential backoff при connect. Альтернатива: runtime-server при старте вызывает readiness callback (env var с URL). Для MVP — retry достаточно.

### 8.3 Transport должен быть full-duplex

**Проблема:** Handler внутри контейнера вызывает `ctx.platform.logger.info()`, `ctx.platform.cache.get()` — это обратные вызовы через тот же канал. TCP адаптер должен поддерживать мультиплексированные сообщения.

**Решение:** Протокол транспорта — framed messages с `type` полем:
```
→ { type: "execute", requestId, handlerRef, input, permissions }
← { type: "stdout", requestId, chunk }
← { type: "platform_call", requestId, callId, method, args }
→ { type: "platform_result", requestId, callId, result }
← { type: "result", requestId, result }
```

### 8.4 Platform proxy latency

**Проблема:** Каждый `ctx.platform.logger.info()` = network round-trip. При 100 log-вызовах — 100 round-trips.

**Решение:** Для fire-and-forget вызовов (logger) — local buffer + batch flush каждые N ms. Для request-response (cache.get) — ожидание ответа неизбежно, но можно batching если несколько вызовов рядом.

### 8.5 Concurrent handlers в одном контейнере

**Проблема:** Если два handler'а выполняются одновременно в одном контейнере, shared state может конфликтовать (process.env, globals).

**Решение:** Каждый handler — отдельный requestId. Runtime-server создаёт изолированный context per request. Для MVP — один handler за раз (sequential). Потом — worker threads или отдельные Node.js процессы внутри контейнера.

### 8.6 Cleanup ordering

**Проблема:** Если `environmentProvider.destroy()` вызывается до `workspaceProvider.release()`, bind mount может быть залочен процессами внутри контейнера.

**Решение:** Строгий порядок cleanup:
```
1. transport.close()              — прекращаем отправку запросов
2. runtime-server graceful stop   — ждём завершения текущих handlers
3. environmentProvider.destroy()  — убиваем контейнер
4. workspaceProvider.release()    — освобождаем workspace
```

### 8.7 Node modules — Q3 уточнение

**Проблема:** С гранулярным workspace (п.4 — только запрошенные пути), node_modules не будут смонтированы если плагин не указал их явно.

**Решение:** `node_modules` — особый случай. Runtime-server должен иметь доступ к зависимостям. Варианты:
- **A:** node_modules всегда монтируется (implicit dependency)
- **B:** node_modules в образе (pre-installed)
- **C:** плагин указывает зависимости в манифесте, workspace ставит их при materialize

Для MVP — **A** (implicit mount node_modules).

---

## 9. MVP — что реализуем первым

### Решение по транспорту (2026-03-05)

**Отказались от `IExecutionTransport` / TCP.** Причина: у нас уже есть рабочий WS-протокол в Gateway (call/chunk/result/error) и `HostCallDispatcher`. Использовать их вместо нового TCP адаптера — ноль нового кода транспорта, та же семантика.

**Новая архитектура dispatch:**
```
workflow → RemoteBackend → POST /internal/dispatch → HostCallDispatcher → WS → RuntimeServer → runInProcess
```

`RuntimeServer` (`@kb-labs/gateway-runtime-server`) подключается к Gateway как Host Agent, регистрирует adapter `execution`, обрабатывает `call { method: 'execute', args: [request] }`.

### Статус реализации

- [x] `RemoteBackend` в `plugin-execution-factory` — роутинг по `environmentId`, dispatch через HTTP
- [x] handlerRef remapping: `workspaceRootOnHost` → `/workspace`
- [x] `@kb-labs/gateway-runtime-server` — WS-клиент к Gateway + `runInProcess` handler
- [x] Тесты: unit (RemoteBackend, RuntimeServer), integration (RemoteBackend ↔ HostCallDispatcher)
- [ ] `DockerEnvironmentAdapter` — `docker run -v workspace:/workspace runtime-server`
- [ ] `EnvironmentDescriptor.endpoints.hostId` — hostId runtime-server после регистрации
- [ ] Readiness: retry пока runtime-server не появится в dispatcher
- [ ] Cleanup ordering: stop runtime-server → destroy container → release workspace
- [ ] Platform proxy logger (noop достаточно для MVP)

**Что откладываем на потом:**
- `IExecutionTransport` / TCP / gRPC — заменён WS через Gateway
- Гранулярный workspace mounting (selective paths из манифеста)
- Permissions → Docker flags трансляция
- Snapshot изоляция
- Secrets через транспорт
- Node modules оптимизация (пока implicit mount)
- Concurrent handlers в одном контейнере
- Platform proxy для cache/state
