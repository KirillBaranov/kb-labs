## Summary

Добавить утилиту `formatDuration(ms)` в пакет `@kb-labs/shared-cli-ui` (`shared/cli-ui`): новый файл `src/utils/duration.ts`, тесты в `src/__tests__/duration.spec.ts`, и экспорт из `src/index.ts`.

## Root cause / context

В `shared/cli-ui` уже живут все мелкие утилиты (`retry`, `flags`, `env`, `path`, `context`) — это правильное место для `formatDuration`. Пакет использует Vitest, паттерн `describe/it/expect`, тесты в `src/__tests__/*.spec.ts`.

## Implementation steps

1. **Создать** `shared/cli-ui/src/utils/duration.ts`:
   ```ts
   export function formatDuration(ms: number): string {
     if (ms < 0) ms = 0;
     if (ms < 1000) return `${Math.round(ms)}ms`;
     const seconds = ms / 1000;
     if (seconds < 60) return `${seconds.toFixed(1)}s`;
     const minutes = Math.floor(seconds / 60);
     const remainingSeconds = Math.round(seconds % 60);
     return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
   }
   ```
   Логика:
   - `ms < 0` → клэмп в 0 (edge case)
   - `0 ≤ ms < 1000` → `"Xms"` (округление до целого)
   - `1000 ≤ ms < 60000` → `"X.Xs"` (одна десятичная)
   - `ms ≥ 60000` → `"Xm Ys"` или `"Xm"` если 0 секунд

2. **Создать** `shared/cli-ui/src/__tests__/duration.spec.ts`:
   ```ts
   import { describe, it, expect } from 'vitest';
   import { formatDuration } from '../utils/duration';

   describe('formatDuration', () => {
     it('returns 0ms for zero input', () => expect(formatDuration(0)).toBe('0ms'));
     it('clamps negative values to 0ms', () => expect(formatDuration(-500)).toBe('0ms'));
     it('formats milliseconds range', () => {
       expect(formatDuration(1)).toBe('1ms');
       expect(formatDuration(500)).toBe('500ms');
       expect(formatDuration(999)).toBe('999ms');
     });
     it('formats seconds range', () => {
       expect(formatDuration(1000)).toBe('1.0s');
       expect(formatDuration(1500)).toBe('1.5s');
       expect(formatDuration(59999)).toBe('60.0s');
     });
     it('formats minutes range', () => {
       expect(formatDuration(60000)).toBe('1m');
       expect(formatDuration(90000)).toBe('1m 30s');
       expect(formatDuration(3600000)).toBe('60m');
     });
   });
   ```

3. **Добавить экспорт** в `shared/cli-ui/src/index.ts` — после последнего `export * from './utils/...'`:
   ```ts
   export * from './utils/duration';
   ```

## Tests / verification

```bash
# Запустить только тест duration
pnpm --filter @kb-labs/shared-cli-ui test -- --reporter=verbose duration

# Type-check пакета
pnpm --filter @kb-labs/shared-cli-ui type-check

# Проверить, что экспорт виден после сборки
kb-devkit run build --affected
```
