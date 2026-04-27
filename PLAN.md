## Summary

Создать простую утилитарную функцию `helloWorld()` в новом файле внутри подходящего пакета монорепозитория и экспортировать её из него.

## Root cause / context

Issue запрашивает минимальный "hello world" utility. Наиболее подходящее место — пакет `shared/http` или отдельный легковесный пакет в `shared/`. Однако, поскольку issue не указывает конкретный пакет, а функция носит утилитарный характер без привязки к домену, её следует разместить в `shared/` — в существующем пакете `@kb-labs/shared-cli-ui` или создать отдельный файл в одном из shared-пакетов. Наиболее нейтральное место — `shared/testing` (если это тестовая утилита) или `shared/http` (если общая). Судя по описанию issue — это просто демонстрационная/примерная функция; логичнее всего добавить её в `shared/http` как утилиту общего назначения.

## Implementation steps

1. **Создать файл** `shared/http/src/hello-world.ts`:
   ```ts
   export function helloWorld(): string {
     return 'Hello, World!';
   }
   ```

2. **Добавить экспорт** в `shared/http/src/index.ts`:
   ```ts
   export { helloWorld } from './hello-world.js';
   ```

## Tests / verification

1. Убедиться, что TypeScript компилирует без ошибок:
   ```bash
   pnpm --filter @kb-labs/shared-http type-check
   ```

2. Убедиться, что функция доступна через публичный API пакета:
   ```bash
   node -e "const { helloWorld } = require('./shared/http/dist/index.cjs'); console.log(helloWorld());"
   # Expected: Hello, World!
   ```

3. (Опционально) Добавить unit-тест в `shared/http/src/__tests__/hello-world.test.ts`:
   ```ts
   import { describe, it, expect } from 'vitest';
   import { helloWorld } from '../hello-world.js';

   describe('helloWorld', () => {
     it('returns Hello, World!', () => {
       expect(helloWorld()).toBe('Hello, World!');
     });
   });
   ```
   Запустить:
   ```bash
   pnpm --filter @kb-labs/shared-http test
   ```
