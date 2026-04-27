---

## Summary

Создать утилитарную функцию `helloWorld(name: string): string` в новом файле `src/hello.ts` в корне монорепозитория и экспортировать её из него.

## Root cause / context

Issue #22 — минимальная задача: добавить standalone-утилиту в корень воркспейса. Корневой `package.json` использует `"type": "module"` и TypeScript. `src/` директории на корневом уровне не существует — нужно создать. Функция не привязана к конкретному пакету монорепо и добавляется как самостоятельный файл согласно постановке задачи.

## Implementation steps

1. **Создать `src/hello.ts`** в корне воркдерева (`/Users/kirillbaranov/Desktop/kb-labs-workspace/.worktrees/wt_0e419f30/src/hello.ts`):

   ```ts
   export function helloWorld(name: string): string {
     return `Hello, ${name}!`;
   }
   ```

   Никаких дополнительных импортов, комментариев или зависимостей не требуется.

## Tests / verification

1. Убедиться, что файл создан и экспортирует функцию с правильной сигнатурой:
   ```bash
   grep -n "export function helloWorld" src/hello.ts
   ```

2. Проверить возвращаемое значение вручную через TypeScript REPL или node:
   ```bash
   node --input-type=module <<< "import { helloWorld } from './src/hello.ts'; console.log(helloWorld('World'));"
   # Ожидается: Hello, World!
   ```

3. Убедиться, что TypeScript компилируется без ошибок (если есть tsconfig на корневом уровне):
   ```bash
   pnpm --filter @kb-labs/monorepo type-check 2>/dev/null || npx tsc --noEmit src/hello.ts --strict
   ```
