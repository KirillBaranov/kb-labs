# Platform Adapter Pipeline

> Status: **Implemented**
> Last updated: 2026-05-16

---

## Контекст

Каждый адаптер `PlatformServices` (LLM, cache, storage, vector store и другие) проходит через именованный слотовый пайплайн перед тем, как попасть к плагину.

До рефакторинга существовало три независимых ручных списка:
1. **`governed.ts`** — 350-строчный монолит с инлайновыми проверками прав на каждый адаптер
2. **`create-proxy-platform.ts`** — явный объект с захардкоженными именами адаптеров
3. **`child-ipc-server.ts`** — exhaustive switch по именам адаптеров

Добавление нового адаптера требовало правок в трёх местах. Несколько адаптеров (`artifacts`, `snapshotManager`) молча отсутствовали в governance. EventBus в worker-процессах был noop.

---

## Архитектура

### Пайплайн

```
raw → router → post-router → resource-broker → post-resource-broker → governance
```

| Слот | Зарезервирован | Назначение |
|------|---------------|-----------|
| `raw` | нет | До любой системной обработки |
| `router` | да | LLMRouter, NotifierRouter |
| `post-router` | нет | После роутинга, до рейт-лимитинга |
| `resource-broker` | да | QueuedLLM, ограничение параллелизма |
| `post-resource-broker` | нет | Учёт стоимости, circuit breaker |
| `governance` | да | Применение прав доступа — всегда последний |

Зарезервированные слоты — системные. Middleware адаптеров должны указывать открытый слот.

### ADAPTER_REGISTRY — единый источник истины

Каждый адаптер имеет ровно одну запись. TypeScript обеспечивает исчерпывающее покрытие через `satisfies`: добавление поля в `PlatformServices` без записи в реестре — ошибка компиляции.

```typescript
// core/plugin-runtime/src/platform/adapter-registry.ts
export const ADAPTER_REGISTRY = {
  llm: {
    routerFactory:         (raw, config) => new LLMRouter(raw, config),
    resourceBrokerFactory: (raw, broker) => createQueuedLLM(broker, raw),
    governance: { strategy: 'wrap', fn: wrapLlm },
    ipc:        { strategy: 'proxy', create: (t) => new LLMProxy(t) },
  },
  cache: {
    governance: { strategy: 'wrap', fn: wrapCache },
    ipc:        { strategy: 'proxy', create: (t) => new CacheProxy(t) },
  },
  analytics: {
    governance: { strategy: 'pass-through' },
    ipc:        { strategy: 'noop', create: createNoopAnalytics },
  },
  // ... 13 других адаптеров
} satisfies { [K in keyof Required<PlatformServices>]: AdapterDescriptor<any> };
```

Каждая запись объявляет:
- `routerFactory?` — опционально, фаза 1
- `resourceBrokerFactory?` — опционально, фаза 1
- `governance` — `'wrap'` (с функцией) или `'pass-through'`
- `ipc` — `'proxy'` / `'noop'` / `'local'` / `'absent'`

### Двухфазная сборка

**Фаза 1 — `assemblePlatform(raw, config, broker)`** — один раз при старте. Применяет `routerFactory` и `resourceBrokerFactory` ко всем адаптерам реестра.

**Фаза 2 — `applyPluginGovernance(platform, permissions, pluginId, middlewares?)`** — один раз на плагин. Применяет middleware адаптеров по порядку слотов и локальному приоритету, затем системный governance последним.

### Bidirectional EventBus IPC

Worker-процессы получают полноценный `EventBusProxy` вместо noop.

| Сообщение | Направление | Назначение |
|-----------|-------------|-----------|
| `eventbus:subscribe` | child → parent | Зарегистрировать подписку на топик |
| `eventbus:unsubscribe` | child → parent | Отменить подписку |
| `eventbus:push` | parent → child | Доставить событие подписчику |

`ChildIPCServer` при получении `eventbus:subscribe` вызывает `platform.eventBus.subscribe()` и пересылает события через `child.send()`. `EventBusProxy` в worker слушает входящие push-сообщения и вызывает зарегистрированные handlers.

---

## Как расширять

### Добавить новый адаптер

1. Добавить поле в `PlatformServices` (`@kb-labs/plugin-contracts`) → ошибка компиляции до шага 2
2. Добавить запись в `ADAPTER_REGISTRY` — governance + ipc стратегии
3. Написать governance wrap-функцию или указать `pass-through`

### Добавить системный этап пайплайна

1. Добавить запись в `PIPELINE_SLOTS` с `reserved: true`
2. Вставить имя на нужную позицию в `SLOT_ORDER`
3. Добавить поле фабрики в `AdapterDescriptor` если нужно

Существующие приоритеты middleware адаптеров не затрагиваются — они локальные по слоту.

### Написать middleware адаптера

```typescript
// adapters/my-llm/middlewares/cost-tracker.ts
import type { AdapterMiddlewareFn } from '@kb-labs/plugin-runtime/platform';

export const middleware: AdapterMiddlewareFn<ILLM> = (adapter, ctx) => ({
  ...adapter,
  complete: async (prompt, options) => {
    const start = Date.now();
    const result = await adapter.complete(prompt, options);
    recordCost(Date.now() - start, ctx.pluginId);
    return result;
  },
});
```

Объявить в `AdapterManifest`:

```typescript
middlewares: [
  {
    id: 'cost-tracker',
    handler: './middlewares/cost-tracker.js',
    slot: 'post-resource-broker',   // именованный слот (рекомендуется)
    target: 'llm',
    priority: 10,                    // локальный внутри слота, не глобальный
  }
]
```

---

## Ограничения

**Bootstrap wiring отложен.** `assemblePlatform()` живёт в `plugin-runtime` (Layer 1). `loader.ts` — в `core-runtime` (Layer 0). Layer 0 не может импортировать Layer 1. `initializeResourceBroker()` в `loader.ts` выполняет эквивалентную сборку. Унификация требует либо перемещения `assemblePlatform` в Layer 0, либо вызова из Layer 2+.

---

## Файлы

| Файл | Пакет | Роль |
|------|-------|------|
| `src/platform/middleware.ts` | plugin-runtime | Типы: AdapterMiddlewareFn, AdapterDescriptor, GovernanceDef, IPCDef |
| `src/platform/pipeline-slots.ts` | plugin-runtime | PIPELINE_SLOTS, SLOT_ORDER, validateMiddlewareDecl |
| `src/platform/adapter-registry.ts` | plugin-runtime | ADAPTER_REGISTRY — единый источник истины |
| `src/platform/pipeline.ts` | plugin-runtime | assemblePlatform(), applyPluginGovernance() |
| `src/platform/governed.ts` | plugin-runtime | Shim обратной совместимости → делегирует в applyPluginGovernance() |
| `src/proxy/event-bus-proxy.ts` | core-ipc | Bidirectional EventBus proxy для workers |
| `src/ipc/child-ipc-server.ts` | core-ipc | Обработка subscribe/unsubscribe, динамический dispatch адаптеров |
| `src/serializable/types.ts` | core-platform | EventBusSubscribe/Unsubscribe/Push message types |
| `src/adapters/adapter-manifest.ts` | core-platform | AdapterMiddlewareDecl, AdapterManifest.middlewares |

---

## ADR

[ADR-0001 — Slot-Based Adapter Middleware Pipeline](../../../core/plugin-runtime/docs/adr/ADR-0001-adapter-pipeline.md)
