Достаточно контекста. Вот план реализации:

---

## Summary

Добавить функцию `formatDuration(ms: number): string` в `shared/cli-ui/src/format.ts` и покрыть её тестами в существующем `src/__tests__/format.spec.ts`.

## Root cause / context

В монорепо нет отдельного `shared/utils` пакета — утилиты хранятся в тематических `shared/*` пакетах. Форматирующие хелперы (`formatTimestamp`, `formatRelativeTime`) живут в `shared/cli-ui/src/format.ts`, который уже реэкспортируется из `src/index.ts` через `export * from './format'`. Новая функция органично ложится туда же.

## Implementation steps

1. **`shared/cli-ui/src/format.ts`** — добавить функцию в конец файла (после существующих format-хелперов):

   ```typescript
   export function formatDuration(ms: number): string {
     if (ms < 0) ms = 0;
     if (ms < 1000) return `${Math.round(ms)}ms`;
     const seconds = ms / 1000;
     if (seconds < 60) return `${seconds.toFixed(1)}s`;
     const minutes = Math.floor(seconds / 60);
     const remainingSeconds = Math.round(seconds % 60);
     return remainingSeconds === 0 ? `${minutes}m` : `${minutes}m ${remainingSeconds}s`;
   }
   ```

   Граничные правила:
   - `ms < 0` → clamp до 0, вернуть `"0ms"`
   - `ms === 0` → `"0ms"`
   - `< 1000ms` → `"{n}ms"` (целое)
   - `< 60 000ms` → `"{n.1}s"` (одна десятичная)
   - `≥ 60 000ms` → `"{m}m"` или `"{m}m {s}s"`

2. **`shared/cli-ui/src/__tests__/format.spec.ts`** — добавить `describe('formatDuration', ...)` блок в существующий файл:

   ```typescript
   import { formatTimestamp, formatRelativeTime, formatDuration } from '../format';

   describe('formatDuration', () => {
     it('returns 0ms for zero', () => expect(formatDuration(0)).toBe('0ms'));
     it('clamps negative to 0ms', () => expect(formatDuration(-500)).toBe('0ms'));
     it('formats milliseconds range', () => {
       expect(formatDuration(1)).toBe('1ms');
       expect(formatDuration(999)).toBe('999ms');
     });
     it('formats seconds range', () => {
       expect(formatDuration(1000)).toBe('1.0s');
       expect(formatDuration(1500)).toBe('1.5s');
       expect(formatDuration(59999)).toBe('60.0s');
     });
     it('formats minutes range without remainder', () => {
       expect(formatDuration(60000)).toBe('1m');
       expect(formatDuration(120000)).toBe('2m');
     });
     it('formats minutes range with seconds', () => {
       expect(formatDuration(90000)).toBe('1m 30s');
       expect(formatDuration(3661000)).toBe('61m 1s');
     });
   });
   ```

3. **`shared/cli-ui/src/index.ts`** — изменений не требуется, `export * from './format'` уже присутствует (строка 7).

## Tests / verification

```bash
# Запустить тесты пакета
pnpm --filter @kb-labs/shared-cli-ui test

# Или конкретный файл
pnpm --filter @kb-labs/shared-cli-ui exec vitest run src/__tests__/format.spec.ts

# Проверить type-check
pnpm --filter @kb-labs/shared-cli-ui type-check
```

Убедиться, что все 7 кейсов проходят: `0ms`, отрицательные, ms-диапазон, s-диапазон (с десятичными), минуты без остатка, минуты с секундами.
