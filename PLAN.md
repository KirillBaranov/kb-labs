## Summary

Добавить функцию `debounce` в пакет `@kb-labs/shared-cli-ui` с поддержкой jitter-задержки и колбэка `onRetry`, экспортировать из основного barrel-файла и покрыть юнит-тестами.

## Root cause / context

Пакет `shared/cli-ui` уже содержит timing-утилиты (`timing-tracker.ts`), утилиты (`utils/flags.ts`, `utils/env.ts` и др.), но не имеет универсального `debounce`. Функция нужна как примитив для throttle-ввода, поиска, сохранений и любых сценариев "отложить до паузы". Jitter нужен для предотвращения thundering herd при множественных вызывающих сторонах; `onRetry` — для observability (логирование пересчётов задержки).

## Implementation steps

1. **Создать `shared/cli-ui/src/debounce.ts`**

   Реализовать и экспортировать:

   ```
   export interface DebounceOptions {
     jitter?: number;      // [0, 1] — умножается на delayMs, добавляет случайную часть
     onRetry?: (retryCount: number) => void;  // вызывается при каждой отмене pending-вызова
   }

   export interface DebouncedFn<T extends (...args: unknown[]) => unknown> {
     (...args: Parameters<T>): void;
     cancel(): void;
   }

   export function debounce<T extends (...args: unknown[]) => unknown>(
     fn: T,
     delayMs: number,
     options?: DebounceOptions
   ): DebouncedFn<T>
   ```

   Логика:
   - Хранить `timer: ReturnType<typeof setTimeout> | undefined` и `retryCount = 0` в замыкании.
   - При каждом вызове: если `timer` существует — очистить, инкрементировать `retryCount`, вызвать `options.onRetry(retryCount)`.
   - Вычислить `effectiveDelay = delayMs + Math.random() * (options.jitter ?? 0) * delayMs`.
   - Запустить новый `setTimeout(() => { retryCount = 0; fn(...args); }, effectiveDelay)`.
   - Метод `cancel()`: очищает таймер и сбрасывает `retryCount`.
   - Модуль без внешних зависимостей, чистый TypeScript strict-mode.

2. **Обновить `shared/cli-ui/src/index.ts`**

   Добавить строку экспорта после блока `timing-tracker`:
   ```ts
   export * from './debounce.js';
   ```

3. **Создать `shared/cli-ui/src/__tests__/debounce.spec.ts`**

   Тест-кейсы (все используют `vi.useFakeTimers()` / `vi.useRealTimers()`):

   | Тест | Сценарий |
   |------|---------|
   | immediate single call | один вызов → после `delayMs` функция выполнена ровно 1 раз |
   | debounced call | вызов → `advanceTimersByTime(delayMs - 1)` → fn не вызвана; `advanceTimersByTime(1)` → fn вызвана |
   | multiple rapid calls — only last fires | 3 вызова подряд → `advanceTimersByTime(delayMs)` → fn вызвана 1 раз с аргументами последнего вызова |
   | cancel() prevents execution | вызов → `cancel()` → `advanceTimersByTime(delayMs * 2)` → fn не вызвана |
   | onRetry callback fires on each reschedule | 3 вызова → `onRetry` вызван 2 раза с retryCount 1 и 2 |
   | onRetry retryCount resets after execution | вызов → execute → вызов снова → `onRetry` начинается с 1 |
   | jitter adds extra delay | `jitter=1, delayMs=100` → `advanceTimersByTime(100)` → fn не обязана выполниться (delay ≤ 200); `advanceTimersByTime(100)` → fn выполнена |
   | jitter=0 (default) behaves as standard debounce | без jitter — задержка точно `delayMs` |
   | type inference | TypeScript компилируется без ошибок с типизированными аргументами |

   Паттерн инициализации (как в `format.spec.ts`):
   ```ts
   beforeEach(() => { vi.useFakeTimers(); });
   afterEach(() => { vi.useRealTimers(); });
   ```

## Tests / verification

```bash
# Запустить только тесты пакета
pnpm --filter @kb-labs/shared-cli-ui test

# Проверить типы
pnpm --filter @kb-labs/shared-cli-ui type-check

# Убедиться что сборка не сломана (после тестов)
pnpm --filter @kb-labs/shared-cli-ui build
```

Ожидаемый результат: все 8+ тест-кейсов зелёные, `type-check` без ошибок, `dist/index.js` содержит экспорт `debounce`.
