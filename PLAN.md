## Summary
Добавить утилиту `withRetry` в пакет `@kb-labs/shared-cli-ui` (`shared/cli-ui`) с поддержкой настраиваемого числа попыток, задержки, backoff-стратегии и callback'а `onRetry`. Экспортировать через основной `index.ts`, покрыть unit-тестами через vitest.

## Root cause / context
В `shared/cli-ui` уже есть набор утилит (`src/utils/flags.ts`, `src/utils/env.ts`, `src/utils/path.ts`), но retry-механизма нет. Утилита нужна как общий инструмент для любого кода, использующего пакет (CLI-команды, адаптеры, плагины). Паттерн в кодовой базе — чистые функции с TypeScript-интерфейсами для опций, строгая типизация без внешних зависимостей.

## Implementation steps

1. **Создать `shared/cli-ui/src/utils/retry.ts`**
   - Определить интерфейс `RetryOptions`:
     ```typescript
     export interface RetryOptions {
       attempts?: number;        // default: 3
       delay?: number;           // ms, default: 0
       backoff?: 'fixed' | 'exponential'; // default: 'fixed'
       onRetry?: (error: unknown, attempt: number) => void;
     }
     ```
   - Реализовать `withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T>`:
     - Валидировать параметры на входе: если `attempts < 1` — выбрасывать `RangeError` с описательным сообщением (`"attempts must be >= 1, got N"`)
     - Цикл попыток: при ошибке вызывать `onRetry(err, attempt)`, затем ждать delay (умножать на `2^attempt` для exponential), на последней попытке — выбрасывать последнюю ошибку
     - Delay через `setTimeout` обёрнутый в Promise (чтобы тесты могли использовать `vi.useFakeTimers()`)
   - Экспортировать `withRetry` и `RetryOptions`

2. **Добавить экспорт в `shared/cli-ui/src/index.ts`**
   - Добавить строку: `export { withRetry } from './utils/retry.js';`
   - Добавить `export type { RetryOptions } from './utils/retry.js';`

3. **Обработка граничных случаев в `retry.ts`**
   - `attempts = 0` или отрицательное — `RangeError('attempts must be >= 1, got N')`
   - `delay < 0` — `RangeError('delay must be >= 0, got N')`
   - `fn` не является функцией — `TypeError('fn must be a function')`
   - Эти проверки идут до первого вызова `fn`, чтобы ошибка конфигурации не смешивалась с ошибкой выполнения

4. **Создать `shared/cli-ui/src/__tests__/retry.spec.ts`**
   - Тест: успех с первой попытки — `fn` возвращает значение, `onRetry` не вызывается
   - Тест: успех после N повторных попыток — `fn` падает 2 раза, на 3-й возвращает значение
   - Тест: исчерпание попыток — `fn` всегда падает, `withRetry` выбрасывает последнюю ошибку (не первую)
   - Тест: backoff delays — `vi.useFakeTimers()`, проверить что `setTimeout` вызывается с корректными интервалами (fixed vs exponential)
   - Тест: `onRetry` callback — вызывается с правильными `(error, attemptNumber)` на каждом retry
   - Тест: валидация параметров — `attempts=0` → `RangeError`, `delay=-1` → `RangeError`, `fn` не функция → `TypeError`

## Tests / verification

```bash
# Запустить только тесты retry
pnpm --filter @kb-labs/shared-cli-ui test --reporter=verbose retry

# Убедиться что type-check проходит
pnpm --filter @kb-labs/shared-cli-ui type-check

# Полная проверка пакета
pnpm --filter @kb-labs/shared-cli-ui check
```

Ожидаемый результат: все тесты зелёные, нет ошибок типов, экспорт `withRetry` виден через `import { withRetry } from '@kb-labs/shared-cli-ui'`.
