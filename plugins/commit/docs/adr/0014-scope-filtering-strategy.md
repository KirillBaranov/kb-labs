# ADR-0005: Scope Filtering Strategy

**Status**: Accepted
**Date**: 2025-12-15
**Author**: KB Labs Team

## Context

В monorepo с множеством пакетов нужна возможность генерировать коммиты только для определённой части кодовой базы:

- Разработчик работает над конкретным пакетом
- CI/CD pipeline для отдельного пакета
- Разделение коммитов по областям

Существующие паттерны в KB Labs:
- Release Manager использует `--scope` для фильтрации changelog
- Mind использует include/exclude patterns для индексации

## Decision

Реализовать три типа scope filtering:

### 1. Package Name Scope
```bash
pnpm kb commit:generate --scope "@kb-labs/core"
```

Работает с package.json name. Резолвится в путь пакета.

### 2. Wildcard Package Scope
```bash
pnpm kb commit:generate --scope "@kb-labs/*"
```

Матчит все пакеты по pattern. Полезно для namespace.

### 3. Path Pattern Scope
```bash
pnpm kb commit:generate --scope "packages/sdk/**"
pnpm kb commit:generate --scope "kb-labs-sdk/**"
```

Прямой glob pattern для путей файлов.

### Implementation

```typescript
// scope-resolver.ts
export interface ResolvedScope {
  type: 'package-name' | 'wildcard' | 'path-pattern';
  original: string;
  paths: string[];  // Resolved paths to filter
}

export async function resolveScope(cwd: string, scope: string): Promise<ResolvedScope> {
  // 1. Check if it's a package name (@kb-labs/core)
  if (scope.startsWith('@')) {
    return resolvePackageScope(cwd, scope);
  }

  // 2. Check if it's a path pattern (contains ** or /)
  if (scope.includes('/') || scope.includes('*')) {
    return { type: 'path-pattern', original: scope, paths: [scope] };
  }

  // 3. Assume it's a directory name
  return { type: 'path-pattern', original: scope, paths: [`${scope}/**`] };
}

// Filter files by resolved scope
export function filterFilesByScope(files: string[], scope: ResolvedScope): string[] {
  if (scope.type === 'path-pattern') {
    return files.filter(file => minimatch(file, scope.original));
  }
  return files.filter(file => matchesScope(file, scope));
}
```

### Nested Repo Detection

При использовании scope, система проверяет наличие вложенного git-репозитория:

```typescript
// git-status.ts
if (scope) {
  const nestedRepo = detectNestedRepo(cwd, scope);
  if (nestedRepo) {
    return getNestedRepoStatus(cwd, nestedRepo);
  }
}
```

См. [ADR-0002](./0002-nested-git-repository-support.md) для деталей.

## Consequences

### Positive

1. **Flexibility** - три типа scope покрывают все use cases
2. **Compatibility** - совместимо с release-manager и mind
3. **Intuitive** - `@kb-labs/core` для пакета, `path/**` для директории
4. **Composable** - можно комбинировать с nested repo detection

### Negative

1. **Complexity** - три разных типа scope для понимания
2. **Resolution overhead** - нужно резолвить package names в paths

### Neutral

- По умолчанию scope не задан = все файлы
- Scope влияет на git status и file filtering

## Alternatives Considered

### 1. Only path patterns
Поддерживать только glob patterns без package names.

**Отклонено**: Неудобно для пользователей, привыкших к `--scope @kb-labs/core`.

### 2. Multiple scopes
Поддерживать `--scope a --scope b`.

**Отложено**: Можно добавить в v2. Пока достаточно одного scope.

### 3. Exclude patterns
Добавить `--exclude` для исключения файлов.

**Отложено**: Можно добавить как enhancement. Пока хватает include.

## Usage Examples

```bash
# Specific package
pnpm kb commit:generate --scope "@kb-labs/sdk"

# All packages in namespace
pnpm kb commit:generate --scope "@kb-labs/*"

# Directory pattern (nested repo)
pnpm kb commit:generate --scope "kb-labs-sdk/**"

# Subdirectory
pnpm kb commit:generate --scope "packages/core/**"
```

## Related

- [ADR-0002](./0002-nested-git-repository-support.md) - nested repo detection
- [Release Manager scope](../../kb-labs-release-manager) - similar scope approach
- [scope-resolver.ts](../packages/commit-core/src/analyzer/scope-resolver.ts)
