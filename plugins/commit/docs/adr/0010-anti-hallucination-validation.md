# ADR-0001: Anti-Hallucination Validation for LLM Output

**Status**: Accepted
**Date**: 2025-12-15
**Author**: KB Labs Team

## Context

Commit plugin использует LLM для анализа git-изменений и генерации commit-плана. LLM может галлюцинировать:

1. **Несуществующие файлы** - упоминать файлы, которых нет в git status
2. **Пропущенные файлы** - забыть включить реальные изменённые файлы
3. **Неверные пути** - изменить или сократить пути к файлам

Эти проблемы критичны, так как пользователь может попытаться закоммитить несуществующие файлы или потерять реальные изменения.

## Decision

Реализовать валидацию LLM-ответа по паттерну `SourceVerifier` из `@kb-labs/mind-orchestrator`:

### Принцип работы

```
LLM Response → validateAndFixCommits() → Validated Commits
                      ↓
              1. Remove hallucinations
              2. Remove empty commits
              3. Add missing files
              4. Log warnings
```

### Алгоритм валидации

```typescript
function validateAndFixCommits(
  commits: CommitGroup[],
  summaries: FileSummary[]
): CommitGroup[] {
  const realFiles = new Set(summaries.map((s) => s.path));

  // Step 1: Remove hallucinated files
  for (const commit of commits) {
    commit.files = commit.files.filter(file => realFiles.has(file));
  }

  // Step 2: Remove empty commits (all files were hallucinated)
  const nonEmptyCommits = commits.filter(c => c.files.length > 0);

  // Step 3: Add missing files that LLM forgot
  const allFilesInCommits = new Set(nonEmptyCommits.flatMap(c => c.files));
  const missingFiles = [...realFiles].filter(f => !allFilesInCommits.has(f));

  if (missingFiles.length > 0) {
    nonEmptyCommits.push({
      type: 'chore',
      message: 'update additional files',
      files: missingFiles,
      releaseHint: 'none',
      breaking: false,
    });
  }

  return nonEmptyCommits;
}
```

## Consequences

### Positive

1. **Гарантия корректности** - все файлы в плане существуют в git status
2. **Полнота покрытия** - все изменённые файлы включены в план
3. **Прозрачность** - логирование предупреждений при обнаружении галлюцинаций
4. **Graceful fallback** - пропущенные файлы добавляются в chore-коммит

### Negative

1. **Потеря семантики** - пропущенные файлы группируются в generic chore-коммит вместо правильной группы
2. **Дополнительная обработка** - небольшой overhead на валидацию

### Neutral

- Валидация происходит синхронно после LLM-ответа
- Не требует дополнительных API-вызовов

## Alternatives Considered

### 1. Retry with feedback
Отправить LLM список ошибок и попросить исправить.

**Отклонено**: Увеличивает latency и стоимость токенов. Нет гарантии, что повторный ответ будет корректнее.

### 2. Strict schema validation only
Использовать только JSON schema без проверки файлов.

**Отклонено**: Не ловит семантические галлюцинации (файлы существуют в JSON, но не в реальности).

### 3. Pre-filter prompt with exact file list
Передать LLM строгий список файлов и запретить другие.

**Частично применено**: Файлы уже передаются в промпт. Но LLM всё равно может галлюцинировать.

## Related

- [Mind SourceVerifier](../../kb-labs-mind/packages/mind-orchestrator/src/verification/source-verifier.ts) - референсная реализация
- [ADR-0031 Mind Anti-Hallucination](../../kb-labs-mind/docs/adr/0031-anti-hallucination-system.md)

## Implementation

Реализовано в:
- [commit-plan.ts:validateAndFixCommits()](../packages/commit-core/src/generator/commit-plan.ts)
