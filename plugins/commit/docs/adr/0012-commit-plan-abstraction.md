# ADR-0003: Commit Plan as Intermediate Abstraction

**Status**: Accepted
**Date**: 2025-12-15
**Author**: KB Labs Team

## Context

Существует несколько подходов к автоматической генерации коммитов:

1. **Direct commit** - сразу выполнять `git commit` после анализа
2. **Interactive wizard** - пошаговый диалог с пользователем
3. **Plan-based** - генерировать план, дать возможность review, затем apply

Нужен подход, который:
- Даёт пользователю контроль над результатом
- Позволяет редактировать план до применения
- Поддерживает dry-run режим
- Интегрируется с CI/CD

## Decision

Использовать **Commit Plan** как промежуточную абстракцию между анализом и применением:

### Schema

```typescript
interface CommitPlan {
  schemaVersion: '1.0';
  createdAt: string;
  repoRoot: string;
  gitStatus: {
    staged: string[];
    unstaged: string[];
    untracked: string[];
  };
  commits: CommitGroup[];
  metadata: {
    totalFiles: number;
    totalCommits: number;
    llmUsed: boolean;
    tokensUsed?: number;
  };
}

interface CommitGroup {
  id: string;
  type: ConventionalType;
  scope?: string;
  message: string;
  body?: string;
  files: string[];
  releaseHint: 'none' | 'patch' | 'minor' | 'major';
  breaking: boolean;
}
```

### Workflow

```
git status → generate → plan.json → [review/edit] → apply → git commits
                ↓
            .kb/commit/current/plan.json
```

### Commands

| Command | Description |
|---------|-------------|
| `commit:generate` | Анализ и генерация плана |
| `commit:open` | Просмотр текущего плана |
| `commit:apply` | Применение плана (создание коммитов) |
| `commit:push` | Push коммитов в remote |
| `commit:reset` | Сброс текущего плана |
| `commit` | Full flow: generate → apply |

### Storage

```
.kb/commit/
├── current/
│   └── plan.json       # Active plan
└── history/
    └── {timestamp}/
        ├── plan.json   # Applied plan
        └── result.json # Apply result
```

## Consequences

### Positive

1. **Transparency** - план доступен для просмотра и редактирования
2. **Reproducibility** - план можно сохранить и применить позже
3. **Auditability** - история планов в `.kb/commit/history/`
4. **Flexibility** - можно редактировать план вручную перед apply
5. **CI/CD friendly** - dry-run режим через `commit:generate` без `commit:apply`
6. **Error recovery** - если apply провалился, план сохранён для retry

### Negative

1. **Extra step** - нужно явно вызывать `apply` после `generate`
2. **State management** - нужно следить за актуальностью плана
3. **Staleness risk** - файлы могут измениться между generate и apply

### Neutral

- Default command `commit` объединяет generate + apply
- JSON формат позволяет интеграцию с другими инструментами

## Alternatives Considered

### 1. Direct commit mode
Сразу выполнять коммиты без промежуточного плана.

**Отклонено**: Нет возможности review. Нет dry-run. Сложнее отменить.

### 2. Interactive mode
Пошаговый wizard для каждого файла.

**Отклонено**: Не масштабируется для большого количества файлов. Не автоматизируется.

### 3. Diff-based patching
Хранить патчи вместо списка файлов.

**Отклонено**: Избыточная сложность. Git уже хранит diffs. Plan должен быть простым.

## Related

- [Release Manager plan.json](../../kb-labs-release-manager) - аналогичный подход с release plan
- [Mind commit-plan.ts](../packages/commit-core/src/generator/commit-plan.ts)

## Implementation

- Schema: [types.ts](../packages/commit-core/src/types.ts)
- Generator: [commit-plan.ts](../packages/commit-core/src/generator/commit-plan.ts)
- Storage: [plan-storage.ts](../packages/commit-core/src/storage/plan-storage.ts)
- CLI: [generate.ts](../packages/commit-cli/src/cli/commands/generate.ts)
