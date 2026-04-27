## Summary

Добавить утилиту `withRetry` в пакет `@kb-labs/shared-cli-ui` — новый файл `src/utils/retry.ts`, экспортировать из `src/index.ts`, покрыть тестами.

## Root cause / context

В `shared/cli-ui` уже есть паттерн утилит в `src/utils/` (`flags.ts`, `env.ts`, `context.ts`, `path.ts`). Пакет не имеет retry-механизма. Нужно добавить его туда же, следуя существующему стилю: именованный экспорт, TypeScript strict, без внешних зависимостей.

## Implementation steps

1. **Создать `src/utils/retry.ts`**

   ```typescript
   export interface RetryOptions {
     attempts: number;
     backoff?: number | ((attempt: number) => number);
     onRetry?: (error: unknown, attempt: number) => void;
   }

   export async function withRetry<T>(
     fn: () => Promise<T>,
     options: RetryOptions,
   ): Promise<T> {
     const { attempts, backoff, onRetry } = options;
     let lastError: unknown;
     for (let attempt = 1; attempt <= attempts; attempt++) {
       try {
         return await fn();
       } catch (err) {
         lastError = err;
         if (attempt < attempts) {
           onRetry?.(err, attempt);
           if (backoff !== undefined) {
             const delay = typeof backoff === 'function' ? backoff(attempt) : backoff;
             await new Promise<void>((resolve) => setTimeout(resolve, delay));
           }
         }
       }
     }
     throw lastError;
   }
   ```

2. **Добавить экспорт в `src/index.ts`**

   Добавить строку после `export * from './utils/path';`:
   ```typescript
   export * from './utils/retry';
   ```

3. **Создать `src/__tests__/retry.spec.ts`**

   Покрыть случаи:
   - успех с первой попытки (fn вызвана 1 раз, результат вернулся)
   - успех после N неудач (fn выбрасывает 2 раза, затем возвращает значение)
   - все попытки исчерпаны → выброс последней ошибки
   - задержка backoff: использовать `vi.useFakeTimers()`, проверить что `setTimeout` вызван с правильным значением
   - backoff как функция от номера попытки
   - `onRetry` вызывается с правильными аргументами (error, attempt)

## Tests / verification

```bash
pnpm --filter @kb-labs/shared-cli-ui test --run
```

Все 6+ тест-кейсов должны пройти. Затем:

```bash
pnpm --filter @kb-labs/shared-cli-ui type-check
```

Должен завершиться без ошибок (strict mode). При необходимости собрать пакет:

```bash
kb-devkit run build --affected
```
