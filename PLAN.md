## Summary

Добавить утилиту `debounce` в новый пакет `@kb-labs/shared-utils` (пакет не существует — нужно создать) и покрыть его unit-тестами.

## Root cause / context

В монорепо нет пакета общих утилит: `shared/cli-ui` содержит UI-специфичные хелперы (retry, flags, env), но функции вроде `debounce` туда не относятся. Issue требует создать `shared/utils` по тем же шаблонам, что и остальные shared-пакеты (tsup + vitest + dual ESM/CJS output).

## Implementation steps

1. **Создать директорию и `package.json`**
   - Файл: `shared/utils/package.json`
   - Имя пакета: `@kb-labs/shared-utils`, `type: "module"`, dual exports (`./dist/index.js` / `./dist/index.cjs`), скрипты `build`, `test`, `type-check`, `lint`
   - devDependencies: `@kb-labs/devkit@workspace:*`, `tsup`, `vitest`, `typescript`

2. **Добавить конфиги сборки и тестов**
   - `shared/utils/tsconfig.json` — extends `@kb-labs/devkit/tsconfig/node.json`
   - `shared/utils/tsconfig.build.json` — extends `../../tsconfig.base.json`, `paths: {}`
   - `shared/utils/tsup.config.ts` — `dualPreset`, entry `index: "src/index.ts"`
   - `shared/utils/vitest.config.ts` — extends `@kb-labs/devkit/vitest/node`
   - `shared/utils/eslint.config.js` — по образцу других shared-пакетов

3. **Реализовать `debounce`**
   - Файл: `shared/utils/src/debounce.ts`
   - Сигнатура: `debounce<T extends (...args: unknown[]) => unknown>(fn: T, delay: number): T & { cancel(): void }`
   - Логика: `setTimeout` + `clearTimeout` на каждый вызов; метод `cancel()` сбрасывает таймер

4. **Экспортировать из индекса**
   - Файл: `shared/utils/src/index.ts`
   - Добавить: `export * from './debounce.js'`

5. **Написать тесты**
   - Файл: `shared/utils/src/__tests__/debounce.spec.ts`
   - Кейсы:
     - базовая задержка: функция вызывается один раз через `delay` мс (`vi.useFakeTimers`, `vi.advanceTimersByTime`)
     - multiple rapid calls: несколько быстрых вызовов сворачиваются в один
     - `cancel()`: вызов `cancel()` до истечения задержки предотвращает выполнение

6. **Зарегистрировать пакет в workspace**
   - Проверить `pnpm-workspace.yaml` — glob `shared/**` уже должен подхватывать новый пакет автоматически; если нет — добавить явно

## Tests / verification

```bash
# Установить зависимости нового пакета
pnpm install

# Запустить тесты пакета
pnpm --filter @kb-labs/shared-utils test

# Собрать
pnpm --filter @kb-labs/shared-utils build

# Type-check
pnpm --filter @kb-labs/shared-utils type-check
```

Тесты должны пройти все три кейса; `dist/index.js` и `dist/index.cjs` должны экспортировать `debounce`.
