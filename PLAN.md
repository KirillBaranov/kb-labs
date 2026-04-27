## Summary

Добавить утилитарную функцию `helloWorld()`, возвращающую строку `"Hello, World!"`, в новый файл и экспортировать её. Логичное место — новый пакет `shared/utils` (или файл внутри существующего `shared` пакета), следуя слоёвой структуре монорепо.

## Root cause / context

В кодовой базе нет общего пакета для мелких утилит — только специализированные (`shared/http`, `shared/cli-ui`, `shared/command-kit` и т. д.). Задача — добавить первую такую утилиту. Оптимальное место — новый пакет `@kb-labs/shared-utils` в `shared/utils/`, что соответствует слою 1 (shared) и паттерну остальных `shared/*` пакетов.

## Implementation steps

1. **Создать директорию пакета**
   `shared/utils/`

2. **Создать `shared/utils/package.json`**
   ```json
   {
     "name": "@kb-labs/shared-utils",
     "version": "2.89.0",
     "type": "module",
     "main": "./dist/index.js",
     "types": "./dist/index.d.ts",
     "exports": {
       ".": {
         "types": "./dist/index.d.ts",
         "import": "./dist/index.js"
       }
     },
     "files": ["dist"],
     "scripts": {
       "build": "tsup src/index.ts --format esm --dts",
       "type-check": "tsc --noEmit"
     }
   }
   ```

3. **Создать `shared/utils/src/hello-world.ts`**
   ```ts
   export function helloWorld(): string {
     return 'Hello, World!';
   }
   ```

4. **Создать `shared/utils/src/index.ts`**
   ```ts
   export { helloWorld } from './hello-world.js';
   ```

5. **Создать `shared/utils/tsconfig.json`**
   Расширить от `../../infra/devkit/tsconfig/tsconfig.base.json` (как остальные `shared/*` пакеты).

6. **Добавить пакет в `pnpm-workspace.yaml`**
   Убедиться, что glob `shared/*` уже покрывает новый пакет (проверить текущий файл — скорее всего, уже покрывает).

## Tests / verification

1. **Unit-тест** — создать `shared/utils/src/__tests__/hello-world.test.ts`:
   ```ts
   import { helloWorld } from '../hello-world.js';
   import { describe, it, expect } from 'vitest';

   describe('helloWorld', () => {
     it('returns Hello, World!', () => {
       expect(helloWorld()).toBe('Hello, World!');
     });
   });
   ```

2. **Сборка**:
   ```bash
   kb-devkit run build --filter @kb-labs/shared-utils
   ```

3. **Тип-чек**:
   ```bash
   pnpm --filter @kb-labs/shared-utils type-check
   ```

4. **Запуск тестов**:
   ```bash
   pnpm --filter @kb-labs/shared-utils test
   ```
