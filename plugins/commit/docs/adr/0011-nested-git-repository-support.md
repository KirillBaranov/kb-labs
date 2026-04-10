# ADR-0002: Nested Git Repository Support for Monorepo

**Status**: Accepted
**Date**: 2025-12-15
**Author**: KB Labs Team

## Context

KB Labs использует структуру monorepo с вложенными git-репозиториями:

```
kb-labs/                    # Root repo
├── kb-labs-sdk/           # Nested git repo (submodule)
│   └── .git/
├── kb-labs-mind/          # Nested git repo
│   └── .git/
└── kb-labs-cli/           # Nested git repo
    └── .git/
```

При запуске `git status` из корневого репозитория, вложенные репозитории отображаются как единая директория:

```
?? kb-labs-sdk/
```

Это не даёт информации о реальных изменённых файлах внутри вложенного репозитория.

## Decision

Реализовать автоматическое определение вложенных git-репозиториев при использовании `--scope` флага:

### Алгоритм

1. **Извлечь базовую директорию из scope pattern**
   ```
   "kb-labs-sdk/**" → "kb-labs-sdk"
   "packages/foo/**" → "packages"
   ```

2. **Проверить наличие `.git` в базовой директории**
   ```typescript
   const nestedGit = join(cwd, baseDir, '.git');
   if (existsSync(nestedGit)) {
     // This is a nested repo
   }
   ```

3. **Запустить git status из вложенного репозитория**
   ```typescript
   const git = simpleGit(nestedPath);
   const status = await git.status();
   ```

4. **Добавить префикс к путям файлов**
   ```typescript
   const prefix = relative(rootCwd, nestedPath);
   const prefixedPath = `${prefix}/${file}`;
   // "packages/sdk/src/index.ts" → "kb-labs-sdk/packages/sdk/src/index.ts"
   ```

### Реализация

```typescript
// git-status.ts
export interface GitStatusOptions {
  scope?: string;
}

export async function getGitStatus(cwd: string, options: GitStatusOptions = {}): Promise<GitStatus> {
  const { scope } = options;

  if (scope) {
    const nestedRepo = detectNestedRepo(cwd, scope);
    if (nestedRepo) {
      return getNestedRepoStatus(cwd, nestedRepo);
    }
  }

  // Regular git status
  return getRegularGitStatus(cwd);
}
```

## Consequences

### Positive

1. **Точная информация** - получаем реальные изменённые файлы вместо директории
2. **Совместимость с monorepo** - работает с git submodules и nested repos
3. **Прозрачность** - пути файлов содержат полный путь от корня
4. **Минимальные изменения** - не требует изменений в других частях плагина

### Negative

1. **Ограничение scope** - работает только с первым сегментом пути
2. **Не поддерживает глубоко вложенные repos** - `a/b/c/.git` не определится для `a/**`

### Neutral

- Fallback на обычный git status если `.git` не найден
- Работает только когда передан `--scope`

## Alternatives Considered

### 1. Git submodule foreach
Использовать `git submodule foreach` для получения статуса.

**Отклонено**: Требует, чтобы nested repos были зарегистрированы как submodules. Многие monorepo используют независимые репозитории.

### 2. Always scan for nested .git
Рекурсивно искать все `.git` директории.

**Отклонено**: Performance overhead. Пользователь явно указывает scope, значит знает что хочет.

### 3. Use git worktrees
Использовать git worktrees вместо nested repos.

**Отклонено**: Требует изменения структуры проекта. Не совместимо с существующим setup.

## Related

- [Release Manager git log filtering](../../kb-labs-release-manager/packages/release-manager-core/src/commit-analyzer.ts) - аналогичный подход с `git log -- path`

## Implementation

Реализовано в:
- [git-status.ts](../packages/commit-core/src/analyzer/git-status.ts)
  - `detectNestedRepo()` - определение вложенного репозитория
  - `getNestedRepoStatus()` - получение статуса с префиксом путей
