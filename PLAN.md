## Summary

Добавить утилиту `debounce` в пакет `@kb-labs/shared-cli-ui` (`src/utils/debounce.ts`) с поддержкой jitter-рандомизации задержки и колбэка `onRetry`, экспортировать через `src/index.ts`, покрыть unit-тестами через vitest.

## Root cause / context

В пакете нет встроенной debounce-утилиты, поэтому потребители дублируют логику или тянут внешние зависимости (lodash). Issue #32 закрывает этот пробел: чистая реализация без внешних deps, совместимая с TS strict mode. User feedback добавляет два требования: рандомизация задержки через `jitter` (снижает эффект thundering herd при массовых вызовах) и `onRetry` callback (логирование каждой отменённой/вытесненной попытки).

## Implementation steps

1. **Создать `shared/cli-ui/src/utils/debounce.ts`**

   Экспортировать:
   - `interface DebounceOptions` — `jitter?: number` (диапазон 0..jitter мс добавляется к `delayMs`), `onRetry?: (attempt: number) => void` (вызывается при каждом вытеснении, передаёт порядковый номер отменённой попытки)
   - `type DebouncedFn<T>` — оборачивает T, добавляет метод `.cancel()`
   - `function debounce<T extends (...args: unknown[]) => unknown>(fn: T, delayMs: number, options?: DebounceOptions): DebouncedFn<T>`

   Логика:
   - Хранит `timer: ReturnType<typeof setTimeout> | undefined` и `attempt: number`
   - При каждом вызове: если таймер активен — `clearTimeout(timer)`, инкремент `attempt`, вызов `options.onRetry?.(attempt)`
   - Эффективный delay = `delayMs + (jitter > 0 ? Math.random() * jitter : 0)`
   - Устанавливает новый таймер с эффективным delay
   - `.cancel()` — `clearTimeout(timer)`, сброс состояния

2. **Добавить экспорт в `shared/cli-ui/src/index.ts`**

   Добавить строку рядом с остальными utils-экспортами:
   ```typescript
   export * from './utils/debounce';
   ```

3. **Создать `shared/cli-ui/src/__tests__/debounce.spec.ts`**

   Тест-кейсы (все с `vi.useFakeTimers()`):
   - **immediate call**: функция вызывается через `advanceTimersByTime(delay)` → fn вызвана ровно 1 раз
   - **debounced call**: вызов, затем `advanceTimersByTime(delay - 1)` → fn не вызвана; ещё `advanceTimersByTime(1)` → вызвана 1 раз
   - **multiple rapid calls (only last fires)**: 5 вызовов подряд, `advanceTimersByTime(delay)` → fn вызвана 1 раз с аргументами последнего вызова
   - **onRetry count**: 3 быстрых вызова → `onRetry` вызван 2 раза (первый вызов не вытесняет ничего), счётчик attempt = 1, 2
   - **cancel**: вызов, `cancel()`, `advanceTimersByTime(delay)` → fn не вызвана
   - **jitter expands delay**: мок `Math.random` → `() => 1.0`; задержка = `delayMs + jitter`; проверить что fn не вызвана до `delayMs + jitter`, вызвана после

## Tests / verification

```bash
# запустить тесты пакета
pnpm --filter @kb-labs/shared-cli-ui test

# type-check
pnpm --filter @kb-labs/shared-cli-ui type-check

# сборка (убедиться что экспорт доступен снаружи)
kb-devkit run build --affected
```

Ожидаемый результат: все тест-кейсы зелёные, tsc без ошибок, `debounce` доступна как именованный экспорт из `@kb-labs/shared-cli-ui`.
