## Summary

Добавить функцию `debounce` в `shared/cli-ui` с поддержкой jitter (рандомизация задержки) и `onRetry` callback, экспортировать из главного barrel и покрыть юнит-тестами на vitest.

## Root cause / context

В `@kb-labs/shared-cli-ui` нет утилиты для подавления частых вызовов (debounce). Потребность возникает в CLI-компонентах с высокочастотными событиями (ввод, изменения файлов, прогресс). Jitter нужен для предотвращения «грозового стада» при параллельных вызовах; `onRetry` — для observability (логирование через `ILogger`).

## Implementation steps

1. **Создать файл `shared/cli-ui/src/utils/debounce.ts`**

   Реализовать функцию:
   ```
   debounce<T extends (...args: any[]) => void>(
     fn: T,
     delayMs: number,
     options?: DebounceOptions
   ): DebouncedFn<T>
   ```

   Экспортировать:
   - `interface DebounceOptions` — поля `jitter?: number` (0–1, доля задержки для рандомизации) и `onRetry?: (attempt: number, delayMs: number) => void`
   - `interface DebouncedFn<T>` — callable + метод `.cancel(): void`
   - `function debounce(...)` — логика:
     - Хранит `timerId: ReturnType<typeof setTimeout> | undefined` и счётчик `attempt`
     - При каждом вызове: отменяет предыдущий таймер (`.cancel()`), вычисляет `effectiveDelay = delayMs + jitterOffset` где `jitterOffset = Math.random() * jitter * delayMs`, вызывает `options.onRetry(attempt, effectiveDelay)` если задан, инкрементирует `attempt`, ставит новый `setTimeout`
     - После срабатывания: сбрасывает `timerId` и `attempt`
     - `.cancel()`: вызывает `clearTimeout(timerId)`, сбрасывает `timerId` и `attempt`

2. **Добавить реэкспорт в `shared/cli-ui/src/utils/` barrel** (если есть `utils/index.ts`) или напрямую в главный `src/index.ts`:
   ```ts
   export * from './utils/debounce';
   ```
   Место добавления — рядом с остальными `utils/` экспортами (после строки `export * from './utils/path'`).

3. **Создать тест `shared/cli-ui/src/__tests__/debounce.spec.ts`**

   Тест-кейсы:
   - **Immediate call** — `debounce(fn, 0)`, вызов + `vi.runAllTimers()`, `expect(fn).toHaveBeenCalledOnce()`
   - **Debounced call** — `debounce(fn, 100)`, вызов, проверка что `fn` не вызван сразу, `vi.advanceTimersByTime(100)`, `expect(fn).toHaveBeenCalledOnce()`
   - **Multiple rapid calls — only last fires** — три вызова с интервалом < delayMs, `vi.advanceTimersByTime(100)`, `expect(fn).toHaveBeenCalledOnce()` с аргументами последнего вызова
   - **cancel()** — вызов, `.cancel()`, `vi.runAllTimers()`, `expect(fn).not.toHaveBeenCalled()`
   - **jitter** — мокировать `Math.random`, убедиться что итоговая задержка = `delayMs + jitter * delayMs * mockRandom`
   - **onRetry** — проверить что `onRetry` вызывается при каждом прерванном вызове с правильным `attempt` и `delayMs`

   Шаблон:
   ```ts
   import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
   import { debounce } from '../utils/debounce';

   describe('debounce', () => {
     beforeEach(() => vi.useFakeTimers());
     afterEach(() => vi.useRealTimers());
     // ...
   });
   ```

## Tests / verification

```bash
# Запуск тестов пакета
pnpm --filter @kb-labs/shared-cli-ui test

# TypeScript strict mode проверка
pnpm --filter @kb-labs/shared-cli-ui type-check

# Сборка (убедиться что экспорт попадает в dist)
pnpm --filter @kb-labs/shared-cli-ui build
```

Все три команды должны завершиться без ошибок. Тест `debounce.spec.ts` должен показать 6 пройденных кейсов.
