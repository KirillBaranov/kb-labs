## Summary

Добавить функцию `debounce` в пакет `shared/cli-ui` — новый файл `src/utils/debounce.ts`, реэкспорт через `src/index.ts`, и набор юнит-тестов в `src/__tests__/`.

---

## Root cause / context

В пакете `@kb-labs/shared-cli-ui` уже есть директория `src/utils/` с небольшими утилитами (`flags.ts`, `env.ts`, `context.ts`, `path.ts`). Все они реэкспортируются через `src/index.ts` как `export * from './utils/<name>'`. Функции `debounce` нет ни в утилитах, ни во внешних зависимостях пакета — нужно добавить с нуля. Пакет типизирован в строгом режиме (через `@kb-labs/devkit` preset), внешние зависимости не нужны.

---

## Implementation steps

1. **Создать `shared/cli-ui/src/utils/debounce.ts`**

   Реализовать и экспортировать:
   ```ts
   export function debounce<T extends (...args: unknown[]) => void>(
     fn: T,
     delayMs: number
   ): T & { cancel(): void }
   ```
   - Внутри хранить `timerId: ReturnType<typeof setTimeout> | undefined`
   - Каждый вызов: `clearTimeout(timerId)`, затем `timerId = setTimeout(() => fn(...args), delayMs)`
   - Метод `.cancel()`: `clearTimeout(timerId); timerId = undefined`
   - Никаких внешних зависимостей, чистый TypeScript

2. **Добавить реэкспорт в `shared/cli-ui/src/index.ts`**

   В конец блока утилит добавить строку:
   ```ts
   export * from './utils/debounce';
   ```
   (по аналогии с `'./utils/path'` и остальными)

3. **Создать `shared/cli-ui/src/__tests__/debounce.spec.ts`**

   Тест-кейсы с `vi.useFakeTimers()`:
   - **immediate call** — функция не вызвана до истечения `delayMs`
   - **debounced call** — после `vi.advanceTimersByTime(delayMs)` функция вызвана ровно один раз с правильными аргументами
   - **multiple rapid calls** — при N быстрых вызовах срабатывает только последний (предыдущие отменяются)
   - **cancel()** — вызов `.cancel()` перед истечением таймера предотвращает запуск функции

---

## Tests / verification

```bash
# Запустить только тесты пакета
pnpm --filter @kb-labs/shared-cli-ui test

# Проверить типы
pnpm --filter @kb-labs/shared-cli-ui type-check

# Убедиться что экспорт виден из основного barrel
pnpm --filter @kb-labs/shared-cli-ui build
```

Все четыре теста должны пройти; `type-check` не должен давать ошибок; `debounce` и `cancel` должны присутствовать в типах `dist/index.d.ts`.
