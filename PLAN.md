## Summary

Добавить утилиту `debounce` в `shared/cli-ui` с поддержкой jitter-рандомизации задержки и `onRetry` callback — экспортировать из основного barrel и покрыть unit-тестами.

## Root cause / context

В `@kb-labs/shared-cli-ui` нет встроенного debounce. Утилита нужна для CLI-компонентов, где требуется подавлять частые вызовы (ввод пользователя, события FS). Jitter предотвращает thundering herd при одновременных debounce-цепочках; `onRetry` позволяет логировать каждый сброс таймера через `ILogger` без вмешательства в core-логику.

## Implementation steps

1. **Создать файл** `shared/cli-ui/src/utils/debounce.ts`:

   ```
   export interface DebounceOptions {
     jitter?: number          // max random ms added to delayMs (0 = off)
     onRetry?: (attempt: number, delayMs: number) => void
   }

   export interface DebouncedFn<T extends (...args: unknown[]) => unknown> {
     (...args: Parameters<T>): void
     cancel(): void
   }

   export function debounce<T extends (...args: unknown[]) => unknown>(
     fn: T,
     delayMs: number,
     options?: DebounceOptions
   ): DebouncedFn<T>
   ```

   Логика:
   - Хранит `timer: ReturnType<typeof setTimeout> | undefined` и счётчик `attempt`.
   - При каждом вызове: `clearTimeout(timer)`, вычисляет `effectiveDelay = delayMs + Math.floor(Math.random() * (options.jitter ?? 0))`, инкрементирует `attempt`, если `attempt > 1` — вызывает `options.onRetry?.(attempt, effectiveDelay)`, затем `setTimeout(fn, effectiveDelay)`.
   - Метод `cancel()` сбрасывает таймер и счётчик.

2. **Добавить экспорт** в `shared/cli-ui/src/utils/` — дополнить `shared/cli-ui/src/index.ts`:

   ```ts
   export { debounce } from './utils/debounce.js'
   export type { DebounceOptions, DebouncedFn } from './utils/debounce.js'
   ```

3. **Создать тест** `shared/cli-ui/src/__tests__/debounce.spec.ts`:

   Тест-кейсы с `vi.useFakeTimers()`:
   - **immediate call** — один вызов + `vi.runAllTimers()` → fn вызвана ровно 1 раз
   - **debounced call** — два вызова подряд + `vi.runAllTimers()` → fn вызвана 1 раз с аргументами последнего вызова
   - **multiple rapid calls (only last fires)** — 5 вызовов с `vi.advanceTimersByTime(< delayMs)` между каждым, затем `vi.runAllTimers()` → fn вызвана 1 раз
   - **cancel** — вызов + `cancel()` + `vi.runAllTimers()` → fn не вызвана
   - **jitter** — шпионим `Math.random`, проверяем что `effectiveDelay >= delayMs` и `<= delayMs + jitter`
   - **onRetry callback** — 3 быстрых вызова → `onRetry` вызван 2 раза (attempt=2 и attempt=3) с корректным `delayMs`; `onRetry` НЕ вызван при первом вызове

## Tests / verification

```bash
# из корня монорепо
pnpm --filter @kb-labs/shared-cli-ui test

# type-check
pnpm --filter @kb-labs/shared-cli-ui type-check
```

Все 6 test-кейсов должны пройти; `type-check` — без ошибок в strict mode.
