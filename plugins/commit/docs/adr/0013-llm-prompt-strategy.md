# ADR-0004: LLM Prompt Strategy for Commit Generation

**Status**: Accepted
**Date**: 2025-12-15
**Author**: KB Labs Team

## Context

Для генерации commit-плана нужно передать LLM информацию об изменениях. Возможные подходы:

1. **Full diff** - передать полный `git diff` всех файлов
2. **File summaries** - передать только метаданные (путь, статус, +/- строк)
3. **Semantic analysis** - AST-анализ изменений

Constraints:
- Token limit LLM (обычно 4K-8K для output)
- Стоимость токенов
- Latency
- Качество результата

## Decision

Использовать **File Summaries** - передавать только метаданные файлов без полного содержимого:

### Input Format

```
Files changed:
- src/components/Button.tsx (modified, +15/-3)
- src/hooks/useForm.ts (added, +45/-0)
- package.json (modified, +2/-1)
- README.md (modified, +10/-5)

Recent commit style:
- "feat(ui): add tooltip component"
- "fix(forms): handle null values"
- "chore: update dependencies"

Generate commit plan as JSON:
```

### System Prompt

```
You are a git commit message generator. Output valid JSON only.

Rules:
1. Use conventional commits: feat, fix, refactor, chore, docs, test, build, ci, perf
2. Group related files together (same feature/fix)
3. 1-8 commits maximum
4. Each commit must include releaseHint: none, patch, minor, or major
5. Message should be lowercase, imperative mood, no period at end
6. breaking: true only for breaking API changes
7. For commits with 3+ files, add "body" with bullet points explaining key changes
```

### Output Format

```json
{
  "commits": [
    {
      "id": "c1",
      "type": "feat",
      "scope": "forms",
      "message": "add useForm hook for form state management",
      "files": ["src/hooks/useForm.ts"],
      "releaseHint": "minor",
      "breaking": false
    }
  ]
}
```

## Consequences

### Positive

1. **Low token usage** - ~500-1000 tokens vs 10K+ для full diff
2. **Fast** - меньше токенов = меньше latency
3. **Cost effective** - меньше токенов = дешевле
4. **Scalable** - работает с большим количеством файлов
5. **Privacy** - не передаём содержимое кода в LLM

### Negative

1. **Less context** - LLM не видит что именно изменилось в файле
2. **Grouping by path** - группировка основана на путях, не на семантике
3. **Generic messages** - сообщения могут быть менее специфичными

### Mitigations

1. **Recent commits** - передаём последние коммиты для style reference
2. **File paths** - пути файлов часто содержат семантику (features/, fixes/)
3. **Change stats** - +/- строк помогает понять масштаб изменения
4. **Body field** - для 3+ файлов добавляем детальное описание

## Alternatives Considered

### 1. Full diff approach
Передать полный `git diff` в prompt.

**Отклонено**:
- Token overflow для больших изменений
- Высокая стоимость
- Privacy concerns (код в prompt)

### 2. Chunked diff
Разбить diff на chunks и обрабатывать последовательно.

**Отклонено**:
- Сложность реализации
- Потеря контекста между chunks
- Множественные LLM calls

### 3. AST-based analysis
Парсить код и передавать семантические изменения.

**Частично отклонено**:
- Требует парсеры для каждого языка
- Может быть добавлено в будущем как enhancement

### 4. Hybrid approach
File summaries + selective diff для ключевых файлов.

**Рассматривается для v2**:
- Можно добавить флаг `--detailed`
- Передавать diff только для небольших изменений

## Configuration

```typescript
interface LLMConfig {
  enabled: boolean;        // Use LLM or heuristics
  temperature: number;     // 0.3 default - less creative
  maxTokens: number;       // 2000 default for output
}
```

## Fallback

Если LLM недоступен или ошибка, используем heuristics:

```typescript
function generateHeuristicPlan(summaries: FileSummary[]): CommitGroup[] {
  // Group by directory
  // Type by file extension (.test.ts → test, docs/* → docs)
  // Generic messages
}
```

## Related

- [llm-prompt.ts](../packages/commit-core/src/generator/llm-prompt.ts) - prompt building
- [heuristics.ts](../packages/commit-core/src/generator/heuristics.ts) - fallback logic
- [ADR-0001](./0001-anti-hallucination-validation.md) - output validation
