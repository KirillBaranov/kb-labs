Теперь у меня есть полная картина. Вот план:

---

## Summary

Добавить функцию `formatDuration(ms)` в `shared/cli-ui/src/format.ts` и покрыть её тестами в уже существующем `src/__tests__/format.spec.ts`. Пакет `@kb-labs/shared-cli-ui` — ближайший эквивалент `@kb-labs/shared-utils`.

## Root cause / context

Пакета `@kb-labs/shared-utils` в монорепе нет. Ближайший эквивалент — `@kb-labs/shared-cli-ui` (`shared/cli-ui`), в котором уже живут форматирующие утилиты (`formatSize`, `formatRelativeTime`, `formatTimestamp`) в `src/format.ts`. Все они экспортируются через `src/index.ts` через `export * from './format'` — дополнительного wire-up не нужно.

## Implementation steps

1. **`shared/cli-ui/src/format.ts`** — добавить функцию в конец файла:

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

   Правила:
   - `< 1000ms` → `"Xms"` (округлённые миллисекунды)
   - `1000ms – 59999ms` → `"X.Xs"` (секунды с одним знаком после точки)
   - `≥ 60 000ms` → `"Xm"` или `"Xm Ys"` (минуты + остаток в секундах, если ненулевой)
   - Отрицательные значения → трактуются как `0`

2. **`shared/cli-ui/src/index.ts`** — изменений не требуется; `export * from './format'` уже есть.

3. **`shared/cli-ui/src/__tests__/format.spec.ts`** — добавить `describe('formatDuration', ...)` блок:

   | Кейс | Входное значение | Ожидаемый результат |
   |------|-----------------|---------------------|
   | ноль | `0` | `"0ms"` |
   | отрицательное | `-500` | `"0ms"` |
   | миллисекунды | `250` | `"250ms"` |
   | граница секунд | `999` | `"999ms"` |
   | ровно 1 секунда | `1000` | `"1.0s"` |
   | секунды дробные | `1500` | `"1.5s"` |
   | граница минут | `59999` | `"60.0s"` |
   | ровно 1 минута | `60000` | `"1m"` |
   | минуты + секунды | `90000` | `"1m 30s"` |
   | ровно 2 минуты | `120000` | `"2m"` |

## Tests / verification

```bash
# Запустить тесты пакета
pnpm --filter @kb-labs/shared-cli-ui test

# Type-check
pnpm --filter @kb-labs/shared-cli-ui type-check
```

Все 10 кейсов должны пройти без ошибок. Проверить, что `formatDuration` доступна из публичного API: `import { formatDuration } from '@kb-labs/shared-cli-ui'`.
