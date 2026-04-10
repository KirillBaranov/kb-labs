# ADR-0049: LLM Router — Immutable Bound Adapter via `resolveAdapter()`

**Date:** 2026-02-20
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-02-20
**Tags:** llm, router, architecture, refactor, agent

## Context

После ADR-0048 роутер стал внешней оберткой в цепочке `LLMRouter → QueuedLLM → AnalyticsLLM → RawAdapter`, что позволило `useLLM({ tier })` вызывать `resolve()` напрямую.

Однако в реализации `useLLM()` оставался критический баг: `resolve()` работал через **мутацию глобального состояния** синглтона-роутера:

```typescript
// use-llm.ts (before)
if (options && isLLMRouter(llm)) {
  llm.resolve(options);  // side-effect: мутирует currentModel, currentTier, etc.
}
return llm;  // возвращает тот же объект с изменённым состоянием
```

**Симптом:** в `agent-core` два вызова `useLLM()` стояли подряд:

```typescript
// agent.ts — executeWithTier()
const llm      = useLLM({ tier });           // resolve('large') → currentModel = claude-opus
const smallLLM = useLLM({ tier: 'small' }); // resolve('small') → currentModel = gpt-4o-mini ← перебивает!
```

Второй вызов (SmartSummarizer) перезаписывал `currentAdapterPackage` и `currentModel` в синглтоне. Все последующие вызовы `llm.chatWithTools()` читали перезаписанное состояние и уходили на `gpt-4o-mini` — вне зависимости от того, с каким `--tier` был запущен агент.

**Подтверждение через логи:**

```bash
pnpm kb logs search "LLMRouter resolved" --json
# При каждом запуске с --tier=large:
# tier=large, model=claude-opus-4-5-20251101  ← правильный
# tier=small, model=gpt-4o-mini               ← перебивает, приходит последним
```

## Decision

Заменить паттерн «мутирующий side-effect» на **иммутабельный bound adapter**.

### 1. Новый тип `LLMAdapterBinding` (`@kb-labs/core-platform`)

```typescript
export interface LLMAdapterBinding {
  adapter: ILLM;   // конкретный адаптер (уже обёрнут AnalyticsLLM)
  model: string;   // разрешённое имя модели
  tier: LLMTier;   // фактический tier
}
```

### 2. Новый метод `LLMRouter.resolveAdapter()` (`@kb-labs/llm-router`)

```typescript
async resolveAdapter(options?: UseLLMOptions): Promise<LLMAdapterBinding>
```

- Та же логика выбора tier, что в `resolve()` (tierMapping → fallback к defaultTier)
- Загружает адаптер через существующий `getAdapter()` с кешем (аналитика сохраняется)
- **Не трогает** `this.currentModel`, `this.currentTier`, `this.currentAdapterPackage`

### 3. Класс `LazyBoundLLM` (`@kb-labs/shared-command-kit`)

```typescript
class LazyBoundLLM implements ILLM {
  private _resolved: Promise<LLMAdapterBinding> | null = null;

  constructor(private router: ILLM & ILLMRouter, private options: UseLLMOptions) {}

  private resolve() {
    if (!this._resolved) this._resolved = this.router.resolveAdapter(this.options);
    return this._resolved;
  }

  async chatWithTools(messages, options) {
    const { adapter, model, tier } = await this.resolve();
    return adapter.chatWithTools(messages, { ...options, model, metadata: { ...options.metadata, tier } });
  }
  // complete() и stream() — аналогично
}
```

Lazy-инициализация: `resolveAdapter()` вызывается один раз при первом использовании и кешируется внутри объекта. Каждый вызов `useLLM()` возвращает **отдельный** экземпляр `LazyBoundLLM` с собственным состоянием — они не конфликтуют.

### 4. Обновлённый `useLLM()` (`@kb-labs/shared-command-kit`)

```typescript
// Before: мутирует роутер, возвращает синглтон
if (options && isLLMRouter(llm)) { llm.resolve(options); }
return llm;

// After: возвращает независимый иммутабельный объект
if (options && isLLMRouter(llm)) { return new LazyBoundLLM(llm, options); }
return llm;
```

Глобальный `LLMRouter` больше не мутируется вызовами `useLLM()`.

## Consequences

### Positive

- `useLLM({ tier: 'large' })` и `useLLM({ tier: 'small' })` в одном scope не конфликтуют — каждый вызов возвращает независимый объект
- Агент надёжно использует запрошенный tier на всех итерациях основного цикла
- SmartSummarizer (`small`) больше не перебивает main loop (`large`/`medium`)
- Аналитика сохраняется — адаптер внутри `LazyBoundLLM` уже обёрнут в `AnalyticsLLM`
- Метаданные `tier` передаются явно в каждый вызов `chatWithTools`/`complete`/`stream`
- Обратно совместимо: `useLLM()` без аргументов возвращает роутер как прежде

### Negative

- `useLLM(options)` создаёт новый объект на каждый вызов (вместо синглтона). Код, сравнивающий `llm === anotherLlm` по ссылке, сломается — такого кода в проекте нет
- Легаси-метод `resolve()` остаётся на `ILLMRouter` и всё ещё мутирует стейт — он нужен для диагностических утилит (`getLLMTier()`, status reporting). Прямые вызовы `resolve()` вне `useLLM()` могут создать неожиданное поведение

### Alternatives Considered

- **Передавать `tier` в каждый вызов `chatWithTools`** — потребовало бы изменения сигнатур `ILLM` и всех адаптеров, высокая стоимость
- **Сделать `resolve()` immutable** (возвращать новый router-объект) — ломает существующих потребителей, которые держат ссылку на роутер
- **Добавить мьютекс вокруг resolve+chatWithTools** — решает race condition, но не устраняет архитектурную проблему мутабельного синглтона

## Implementation

### Files Changed

1. **`llm-types.ts`** (`@kb-labs/core-platform`): добавлен `LLMAdapterBinding`, добавлен `resolveAdapter()` в `ILLMRouter`, добавлен `import type { ILLM }`
2. **`adapters/index.ts`** (`@kb-labs/core-platform`): экспорт `LLMAdapterBinding`
3. **`index.ts`** (`@kb-labs/core-platform`): экспорт `LLMAdapterBinding`
4. **`router.ts`** (`@kb-labs/llm-router`): реализация `resolveAdapter()`, импорт `LLMAdapterBinding`
5. **`use-llm.ts`** (`@kb-labs/shared-command-kit`): класс `LazyBoundLLM`, обновлённый `useLLM()`

### Build Order

```
@kb-labs/core-platform → @kb-labs/llm-router → @kb-labs/shared-command-kit → @kb-labs/sdk
```

## References

- [ADR-0046: LLM Router](./0046-llm-router.md)
- [ADR-0047: Multi-Adapter Architecture](./0047-multi-adapter-architecture.md)
- [ADR-0048: LLM Router v2 - Metadata-Based Routing](./0048-llm-router-v2-metadata-routing.md)

---

**Last Updated:** 2026-02-20
**Next Review:** 2026-05-20
