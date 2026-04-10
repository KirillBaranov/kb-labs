# План: Система верификации ответов агентов

## Цель

Добавить систему верификации аналогичную Mind Anti-Hallucination для предотвращения галлюцинаций и оценки качества ответов агентов.

---

## Проблемы текущей системы

1. **Нет верификации ответов** - агент может выдумать файлы/пакеты/классы
2. **Нет оценки уверенности** - непонятно насколько агент уверен в ответе
3. **Нет оценки полноты** - непонятно насколько ответ полный относительно вопроса
4. **scope extraction через LLM** - костыль, можно заменить на верификацию tool results
5. **Self-assessment bias** - LLM переоценивает себя, галлюцинации = высокая уверенность

---

## Ключевое решение: Cross-Tier Verification

**Принцип:** Одна модель выполняет, другая (умнее) проверяет.

```
┌─────────────────────────────────────────────────────────────┐
│  EXECUTOR (small tier: gpt-4o-mini)                         │
│  ─────────────────────────────────────────────────────────  │
│  • 50+ tool calls                                           │
│  • Много токенов, дёшево                                    │
│  • Выполняет основную работу                                │
├─────────────────────────────────────────────────────────────┤
│  VERIFIER (medium tier: gpt-4o / claude-sonnet)             │
│  ─────────────────────────────────────────────────────────  │
│  • 1 вызов через native tool calling                        │
│  • ~1000 токенов, дороже но надёжнее                        │
│  • Независимая оценка результата                            │
│  • Получает: task + answer + tool_results (контекст)        │
│  • Возвращает: confidence, completeness, gaps, warnings     │
└─────────────────────────────────────────────────────────────┘
```

**Почему это работает:**
- Верификатор НЕ ЗНАЕТ как агент пришёл к ответу (нет bias)
- Умнее модель = лучше ловит галлюцинации и логические ошибки
- 1 вызов верификации ≪ стоимости 50 tool calls основной задачи
- Как code review: один пишет, другой проверяет

---

## Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                     Agent Execution (small tier)             │
├─────────────────────────────────────────────────────────────┤
│  1. Execute task with tools                                  │
│  2. Collect tool results (filesRead, filesCreated, etc.)     │
│  3. Generate answer/summary                                  │
├─────────────────────────────────────────────────────────────┤
│              CROSS-TIER VERIFICATION (medium tier)           │
├─────────────────────────────────────────────────────────────┤
│  Verifier receives:                                          │
│  ─────────────────                                           │
│  • Original task                                             │
│  • Agent's answer                                            │
│  • Tool results summary (what files read, what found)        │
│                                                              │
│  Verifier returns (via tool call):                           │
│  ─────────────────────────────────                           │
│  • mentions: extracted file/package/class references         │
│  • verified: which mentions appear in tool results           │
│  • confidence: 0-1 (how reliable is the answer)              │
│  • completeness: 0-1 (how complete vs question)              │
│  • gaps: what wasn't answered                                │
│  • warnings: potential issues found                          │
├─────────────────────────────────────────────────────────────┤
│                     OUTPUT                                   │
├─────────────────────────────────────────────────────────────┤
│  TaskResult + VerificationReport                             │
│  • verifiedMentions: string[]                               │
│  • unverifiedMentions: string[]                             │
│  • confidence: number (0-1)                                 │
│  • completeness: number (0-1)                               │
│  • gaps: string[]                                           │
│  • warnings: string[]                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Contracts & Types (~30 LOC)

### Файл: `agent-contracts/src/verification.ts`

```typescript
/**
 * Verification result for agent responses
 */
export interface VerificationResult {
  /** Mentions that were verified against tool results or filesystem */
  verifiedMentions: string[];
  /** Mentions that could not be verified */
  unverifiedMentions: string[];
  /** Overall verification confidence (0-1) */
  confidence: number;
  /** Warnings about potential issues */
  warnings: VerificationWarning[];
}

export interface VerificationWarning {
  code: 'UNVERIFIED_FILE' | 'UNVERIFIED_PACKAGE' | 'UNVERIFIED_CLASS' | 'LOW_CONFIDENCE';
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Agent self-assessment of response quality
 */
export interface SelfAssessment {
  /** How confident is the agent in the answer (0-1) */
  confidence: number;
  /** How complete is the answer relative to the question (0-1) */
  completeness: number;
  /** What gaps remain unanswered */
  gaps: string[];
  /** Reasoning for the assessment */
  reasoning: string;
}

/**
 * Extended TaskResult with verification
 */
export interface VerifiedTaskResult extends TaskResult {
  /** Verification of mentioned entities */
  verification?: VerificationResult;
  /** Agent's self-assessment */
  selfAssessment?: SelfAssessment;
}
```

### Обновить `TaskResult` в `types.ts`:

```typescript
export interface TaskResult {
  // ... existing fields ...

  /** Verification of mentioned entities (anti-hallucination) */
  verification?: import('./verification.js').VerificationResult;

  /** Agent's self-assessment of response quality */
  selfAssessment?: import('./verification.js').SelfAssessment;
}
```

---

## Phase 2: Cross-Tier Verifier (~120 LOC)

### Файл: `agent-core/src/verification/cross-tier-verifier.ts`

```typescript
/**
 * Cross-Tier Verifier
 *
 * Uses a DIFFERENT (smarter) model to verify agent responses.
 * This avoids self-assessment bias where LLM overestimates itself.
 *
 * Key insight: verification is 1 API call vs 50+ tool calls for execution.
 * Using medium tier for verification is cost-effective and more reliable.
 */

import { useLLM } from '@kb-labs/sdk';
import type { LLMAdapter } from '@kb-labs/core-platform';

export interface VerificationInput {
  /** Original task/question */
  task: string;
  /** Agent's final answer */
  answer: string;
  /** Summary of tool results (files read, commands run, etc.) */
  toolResultsSummary: string;
  /** List of files that were actually read */
  filesRead?: string[];
}

export interface VerificationOutput {
  /** Entities mentioned in answer (files, packages, classes) */
  mentions: string[];
  /** Which mentions appear in tool results */
  verified: string[];
  /** Which mentions could NOT be verified */
  unverified: string[];
  /** Overall confidence in answer (0-1) */
  confidence: number;
  /** How complete is the answer (0-1) */
  completeness: number;
  /** What aspects of the question weren't addressed */
  gaps: string[];
  /** Potential issues found */
  warnings: string[];
  /** Brief reasoning for the assessment */
  reasoning: string;
}

/**
 * Tool definition for verification
 * Verifier MUST call this tool to submit assessment
 */
export const VERIFICATION_TOOL = {
  name: 'submit_verification',
  description: 'Submit your verification of the agent response',
  inputSchema: {
    type: 'object' as const,
    properties: {
      mentions: {
        type: 'array',
        items: { type: 'string' },
        description: 'All file paths, package names, class names mentioned in the answer',
      },
      verified: {
        type: 'array',
        items: { type: 'string' },
        description: 'Mentions that appear in tool results (confirmed to exist)',
      },
      unverified: {
        type: 'array',
        items: { type: 'string' },
        description: 'Mentions NOT found in tool results (potential hallucinations)',
      },
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'How confident the answer is correct. 1.0=certain, 0.7=fairly sure, 0.5=uncertain, 0.3=likely wrong',
      },
      completeness: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'How completely the answer addresses the question. 1.0=fully, 0.7=mostly, 0.5=partially, 0.3=barely',
      },
      gaps: {
        type: 'array',
        items: { type: 'string' },
        description: 'Aspects of the question that remain unanswered',
      },
      warnings: {
        type: 'array',
        items: { type: 'string' },
        description: 'Potential issues: hallucinations, contradictions, missing context',
      },
      reasoning: {
        type: 'string',
        description: 'Brief explanation of your assessment',
      },
    },
    required: ['mentions', 'verified', 'unverified', 'confidence', 'completeness', 'gaps', 'warnings', 'reasoning'],
  },
};

/**
 * Build prompt for cross-tier verification
 */
function buildVerificationPrompt(input: VerificationInput): string {
  return `You are a VERIFICATION agent. Your job is to check another agent's response for accuracy.

## Original Task
${input.task}

## Agent's Answer
${input.answer}

## Tool Results Summary (what agent actually found)
${input.toolResultsSummary}

## Files Actually Read
${input.filesRead?.join('\n') || 'None listed'}

---

## Your Task

1. **Extract mentions**: Find all file paths, package names, class/function names mentioned in the answer
2. **Verify mentions**: Check which mentions appear in the tool results (verified) vs not (unverified)
3. **Assess confidence**: How likely is the answer correct? (unverified mentions = lower confidence)
4. **Assess completeness**: Does the answer fully address the original task?
5. **Identify gaps**: What parts of the question weren't answered?
6. **Flag warnings**: Any contradictions, hallucinations, or issues?

Call submit_verification with your assessment.`;
}

/**
 * Request verification from medium tier model
 */
export async function requestVerification(
  input: VerificationInput,
  executorTier: 'small' | 'medium' | 'large' = 'small'
): Promise<VerificationOutput> {
  // Use tier above executor for verification
  const verifierTier = executorTier === 'small' ? 'medium' : 'large';
  const llm = useLLM({ tier: verifierTier });

  if (!llm) {
    return createFallbackVerification('LLM not available');
  }

  const prompt = buildVerificationPrompt(input);

  try {
    const response = await llm.chatWithTools(
      [{ role: 'user', content: prompt }],
      {
        tools: [VERIFICATION_TOOL],
        temperature: 0.1, // Low temperature for consistent verification
      }
    );

    const toolCall = response.toolCalls?.[0];
    if (toolCall && toolCall.name === 'submit_verification') {
      const result = toolCall.input as VerificationOutput;
      return {
        mentions: result.mentions || [],
        verified: result.verified || [],
        unverified: result.unverified || [],
        confidence: clamp(result.confidence, 0, 1),
        completeness: clamp(result.completeness, 0, 1),
        gaps: result.gaps || [],
        warnings: result.warnings || [],
        reasoning: result.reasoning || '',
      };
    }
  } catch (error) {
    return createFallbackVerification(`Verification failed: ${error}`);
  }

  return createFallbackVerification('No tool call received');
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createFallbackVerification(reason: string): VerificationOutput {
  return {
    mentions: [],
    verified: [],
    unverified: [],
    confidence: 0.5,
    completeness: 0.5,
    gaps: ['Verification could not be completed'],
    warnings: [reason],
    reasoning: reason,
  };
}
```

### Преимущества cross-tier подхода

| Аспект | Self-Assessment | Cross-Tier Verification |
|--------|-----------------|-------------------------|
| Bias | Высокий (LLM переоценивает себя) | Низкий (независимая модель) |
| Extraction | Regex (ненадёжно) | LLM extraction (точнее) |
| Стоимость | 1 вызов small | 1 вызов medium |
| Надёжность | Галлюцинация = высокая уверенность | Ловит галлюцинации |

---

## Phase 3: Tool Results Summarizer (~60 LOC)

### Файл: `agent-core/src/verification/tool-results-summarizer.ts`

```typescript
/**
 * Tool Results Summarizer
 *
 * Prepares tool results for verification by extracting key information.
 * The verifier needs to know what files were read and what was found.
 */

export interface ToolResultRecord {
  tool: string;
  input: Record<string, unknown>;
  output: string;
  timestamp?: string;
}

export interface ToolResultsSummary {
  /** Human-readable summary for verifier */
  text: string;
  /** Files that were read */
  filesRead: string[];
  /** Files that were created/modified */
  filesWritten: string[];
  /** Commands that were executed */
  commandsRun: string[];
  /** Searches that were performed */
  searchQueries: string[];
}

/**
 * Summarize tool results for verification
 */
export function summarizeToolResults(results: ToolResultRecord[]): ToolResultsSummary {
  const filesRead: string[] = [];
  const filesWritten: string[] = [];
  const commandsRun: string[] = [];
  const searchQueries: string[] = [];
  const summaryParts: string[] = [];

  for (const result of results) {
    const toolName = result.tool;
    const input = result.input;

    // Categorize by tool type
    if (toolName.includes('read') || toolName.includes('fs:read')) {
      const path = (input.path || input.file_path) as string;
      if (path) {
        filesRead.push(path);
        summaryParts.push(`Read file: ${path}`);
      }
    } else if (toolName.includes('write') || toolName.includes('edit')) {
      const path = (input.path || input.file_path) as string;
      if (path) {
        filesWritten.push(path);
        summaryParts.push(`Wrote file: ${path}`);
      }
    } else if (toolName.includes('bash') || toolName.includes('exec')) {
      const cmd = (input.command || input.cmd) as string;
      if (cmd) {
        commandsRun.push(cmd);
        summaryParts.push(`Ran command: ${cmd.slice(0, 100)}`);
      }
    } else if (toolName.includes('search') || toolName.includes('grep') || toolName.includes('glob')) {
      const query = (input.query || input.pattern || input.text) as string;
      if (query) {
        searchQueries.push(query);
        summaryParts.push(`Searched: ${query}`);
      }
    } else if (toolName.includes('mind') || toolName.includes('rag')) {
      const query = (input.text || input.query) as string;
      if (query) {
        searchQueries.push(query);
        summaryParts.push(`Mind RAG query: ${query}`);
        // Include RAG results summary (first 500 chars)
        if (result.output) {
          summaryParts.push(`  Result: ${result.output.slice(0, 500)}...`);
        }
      }
    } else if (toolName.includes('list') || toolName.includes('ls')) {
      const path = (input.path || input.directory) as string;
      if (path) {
        summaryParts.push(`Listed directory: ${path}`);
        // Include listing results
        if (result.output) {
          summaryParts.push(`  Contents: ${result.output.slice(0, 300)}...`);
        }
      }
    }
  }

  return {
    text: summaryParts.join('\n') || 'No tool calls recorded',
    filesRead: [...new Set(filesRead)],
    filesWritten: [...new Set(filesWritten)],
    commandsRun,
    searchQueries,
  };
}
```

### Почему нужен summarizer

Верификатор получает:
- НЕ raw tool outputs (слишком много данных)
- А структурированную сводку: что читали, что нашли

Это уменьшает контекст и помогает верификатору сфокусироваться.

---

## Phase 4: Integration into Agent (~50 LOC)

### Файл: `agent-core/src/agent.ts` (модификации)

```typescript
import { requestVerification, type VerificationOutput } from './verification/cross-tier-verifier.js';
import { summarizeToolResults, type ToolResultRecord } from './verification/tool-results-summarizer.js';

// В методе execute() после получения результата:

private async verifyResponse(
  task: string,
  result: TaskResult,
  toolHistory: ToolResultRecord[],
  executorTier: 'small' | 'medium' | 'large'
): Promise<TaskResult> {
  // 1. Summarize tool results for verifier
  const summary = summarizeToolResults(toolHistory);

  // 2. Request cross-tier verification
  const verification = await requestVerification(
    {
      task,
      answer: result.summary,
      toolResultsSummary: summary.text,
      filesRead: summary.filesRead,
    },
    executorTier
  );

  // 3. Emit verification event
  this.emit({
    type: 'verification:complete',
    timestamp: new Date().toISOString(),
    data: verification,
  });

  // 4. Log warnings if low confidence
  if (verification.confidence < 0.5) {
    this.logger?.warn(`[agent] Low confidence response: ${verification.confidence}`);
    this.logger?.warn(`[agent] Gaps: ${verification.gaps.join(', ')}`);
  }

  // 5. Return enriched result
  return {
    ...result,
    verification: {
      verifiedMentions: verification.verified,
      unverifiedMentions: verification.unverified,
      confidence: verification.confidence,
      warnings: verification.warnings.map(w => ({
        code: 'VERIFICATION_WARNING' as const,
        message: w,
      })),
    },
    qualityMetrics: {
      confidence: verification.confidence,
      completeness: verification.completeness,
      gaps: verification.gaps,
      reasoning: verification.reasoning,
    },
  };
}
```

### Когда вызывать верификацию

```typescript
// В execute():
const result = await this.runTask(task);

// Verify if answer is substantial
if (result.summary && result.summary.length > 50) {
  return this.verifyResponse(task, result, this.toolHistory, this.config.tier);
}

return result;
```

---

## Phase 5: Orchestrator Integration (~40 LOC)

### Файл: `agent-core/src/orchestrator.ts` (модификации)

В `synthesizeResearchResults()` добавить верификацию синтезированного ответа:

```typescript
import { requestVerification } from './verification/cross-tier-verifier.js';
import { summarizeToolResults } from './verification/tool-results-summarizer.js';

// После синтеза ответа
const synthesizedAnswer = response.content;

// Собрать все tool results от subtasks
const allToolResults = subtaskResults.flatMap(r => r.toolHistory || []);
const summary = summarizeToolResults(allToolResults);

// Верифицировать финальный синтезированный ответ (medium → large tier)
const verification = await requestVerification(
  {
    task: originalTask,
    answer: synthesizedAnswer,
    toolResultsSummary: summary.text,
    filesRead: summary.filesRead,
  },
  'medium' // orchestrator uses medium, verify with large
);

// Добавить в orchestrator:answer event
this.emit({
  type: 'orchestrator:answer',
  timestamp: new Date().toISOString(),
  data: {
    synthesizedAnswer,
    confidence: verification.confidence,
    completeness: verification.completeness,
    gaps: verification.gaps,
    unverifiedMentions: verification.unverified,
    warnings: verification.warnings,
  },
});

// Log if quality is low
if (verification.confidence < 0.6) {
  this.logger?.warn(`[orchestrator] Low confidence synthesis: ${verification.confidence}`);
  this.logger?.warn(`[orchestrator] Unverified: ${verification.unverified.join(', ')}`);
}
```

### Каскад верификации

```
Subtask agents (small) → verified by medium
Orchestrator synthesis (medium) → verified by large

Чем выше уровень, тем умнее верификатор.
```

### Реакция оркестратора на верификацию

**Ключевое:** Оркестратор должен ДЕЙСТВОВАТЬ на основе верификации, а не просто логировать.

```typescript
// После верификации subtask результата:
async function handleSubtaskResult(
  subtask: Subtask,
  result: TaskResult,
  verification: VerificationOutput
): Promise<void> {

  // 1. КРИТИЧНО: много unverified mentions = переделать
  if (verification.unverified.length > 3) {
    this.logger.warn(`[orchestrator] Subtask ${subtask.id} has ${verification.unverified.length} unverified mentions, retrying...`);

    // Retry с более строгим промптом
    const retryResult = await this.retrySubtask(subtask, {
      additionalContext: `Previous attempt mentioned entities that don't exist: ${verification.unverified.join(', ')}. Only reference files/packages you actually find via tools.`,
    });

    return this.handleSubtaskResult(subtask, retryResult, await this.verify(retryResult));
  }

  // 2. LOW CONFIDENCE: попробовать другой подход
  if (verification.confidence < 0.4) {
    this.logger.warn(`[orchestrator] Subtask ${subtask.id} confidence ${verification.confidence}, trying different approach...`);

    // Переформулировать задачу
    const reformulatedTask = await this.reformulateTask(subtask.task, verification.gaps);
    const retryResult = await this.executeSubtask({ ...subtask, task: reformulatedTask });

    return this.handleSubtaskResult(subtask, retryResult, await this.verify(retryResult));
  }

  // 3. INCOMPLETE: создать дополнительные subtasks для gaps
  if (verification.completeness < 0.6 && verification.gaps.length > 0) {
    this.logger.info(`[orchestrator] Subtask ${subtask.id} incomplete, creating follow-up tasks for gaps...`);

    for (const gap of verification.gaps.slice(0, 2)) { // Max 2 follow-ups
      this.addSubtask({
        task: `Address missing aspect: ${gap}`,
        parentId: subtask.id,
        priority: 'high',
      });
    }
  }

  // 4. OK: принять результат
  this.acceptSubtaskResult(subtask, result, verification);
}
```

### Пороги для решений

| Метрика | Порог | Действие |
|---------|-------|----------|
| `unverified.length > 3` | Критично | Retry с предупреждением |
| `confidence < 0.4` | Низкий | Reformulate и retry |
| `confidence < 0.6` | Средний | Пометить как uncertain |
| `completeness < 0.6` | Неполный | Создать follow-up subtasks |
| `warnings.includes('contradiction')` | Конфликт | Запросить уточнение |

### Лимиты retry

```typescript
const MAX_RETRIES = 2;
const retryCount = this.retryCounters.get(subtask.id) ?? 0;

if (retryCount >= MAX_RETRIES) {
  this.logger.error(`[orchestrator] Subtask ${subtask.id} failed after ${MAX_RETRIES} retries`);
  this.markSubtaskFailed(subtask, {
    reason: 'max_retries_exceeded',
    lastVerification: verification,
  });
  return;
}

this.retryCounters.set(subtask.id, retryCount + 1);
```

### Финальный синтез с учётом качества

```typescript
async function synthesizeWithQualityAwareness(
  subtaskResults: SubtaskResult[]
): Promise<string> {
  // Отфильтровать unreliable результаты
  const reliableResults = subtaskResults.filter(r =>
    r.verification.confidence >= 0.5 &&
    r.verification.unverified.length <= 2
  );

  const unreliableResults = subtaskResults.filter(r =>
    r.verification.confidence < 0.5 ||
    r.verification.unverified.length > 2
  );

  // Включить в промпт информацию о качестве
  const synthesisPrompt = `
Synthesize the following research results.

## Reliable Results (use as primary source):
${reliableResults.map(r => `- ${r.summary} (confidence: ${r.verification.confidence})`).join('\n')}

## Uncertain Results (use with caution, verify claims):
${unreliableResults.map(r => `- ${r.summary} (confidence: ${r.verification.confidence}, issues: ${r.verification.warnings.join(', ')})`).join('\n')}

## Known Gaps (acknowledge in answer):
${[...new Set(subtaskResults.flatMap(r => r.verification.gaps))].join('\n')}

Prioritize reliable results. For uncertain results, either verify the claims or explicitly note uncertainty.
`;

  return this.llm.chat(synthesisPrompt);
}
```

---

## Phase 6: Event Contract Updates (~20 LOC)

### Файл: `agent-contracts/src/events.ts`

```typescript
// Добавить новый тип события
export interface VerificationCompleteEvent extends AgentEventBase {
  type: 'verification:complete';
  data: {
    verification: VerificationResult;
    selfAssessment?: SelfAssessment;
  };
}

// Обновить OrchestratorAnswerEvent
export interface OrchestratorAnswerEvent extends AgentEventBase {
  type: 'orchestrator:answer';
  data: {
    synthesizedAnswer?: string;
    answer?: string;
    // NEW: Quality metrics
    confidence?: number;      // 0-1, how confident in answer
    completeness?: number;    // 0-1, how complete relative to question
    gaps?: string[];          // What aspects weren't addressed
  };
}

// Добавить в AgentEvent union
export type AgentEvent =
  | ... existing ...
  | VerificationCompleteEvent;
```

---

## Файлы для изменения

| Файл | Действие | LOC |
|------|----------|-----|
| `agent-contracts/src/verification.ts` | CREATE | ~40 |
| `agent-contracts/src/types.ts` | MODIFY | ~15 |
| `agent-contracts/src/events.ts` | MODIFY | ~25 |
| `agent-contracts/src/index.ts` | MODIFY | ~2 |
| `agent-core/src/verification/cross-tier-verifier.ts` | CREATE | ~120 |
| `agent-core/src/verification/tool-results-summarizer.ts` | CREATE | ~60 |
| `agent-core/src/verification/index.ts` | CREATE | ~10 |
| `agent-core/src/agent.ts` | MODIFY | ~50 |
| `agent-core/src/orchestrator.ts` | MODIFY | ~40 |
| `agent-core/src/index.ts` | MODIFY | ~5 |

**Итого: ~370 LOC**

### Стоимость верификации

| Сценарий | Executor | Verifier | Доп. стоимость |
|----------|----------|----------|----------------|
| Simple task | small (gpt-4o-mini) | medium (gpt-4o) | ~$0.002 per verify |
| Complex task | medium (gpt-4o) | large (claude-opus) | ~$0.02 per verify |
| Orchestrator | medium | large | ~$0.02 per synthesis |

При средней задаче в $0.10-0.50, верификация добавляет 1-5% стоимости.

---

## Что это даёт

### Для пользователя (UI)
- ✅ Видно confidence (0-100%) для каждого ответа
- ✅ Видно completeness - насколько полный ответ
- ✅ Видно gaps - что осталось неотвеченным
- ✅ Видно warnings если есть непроверенные упоминания
- ✅ Видно verified/unverified mentions

### Для системы
- ✅ **Cross-tier verification** - независимая модель оценивает результат
- ✅ **Нет self-assessment bias** - верификатор не знает "как" агент думал
- ✅ **LLM extraction** - умнее regex, точнее извлекает mentions
- ✅ Автоматическое выявление галлюцинаций
- ✅ Верификация против tool results (надёжнее чем filesystem)
- ✅ Метрики качества для аналитики
- ✅ Можно добавить retry если confidence < threshold

### Пример вывода

```json
{
  "type": "orchestrator:answer",
  "data": {
    "synthesizedAnswer": "В kb-labs-mind есть пакеты: mind-engine, mind-cli...",
    "confidence": 0.85,
    "completeness": 0.90,
    "gaps": ["Не описаны внутренние зависимости между пакетами"]
  }
}

{
  "type": "verification:complete",
  "data": {
    "verification": {
      "verifiedMentions": ["mind-engine", "mind-cli", "mind-orchestrator"],
      "unverifiedMentions": ["mind-auth"],
      "confidence": 0.92,
      "warnings": [{
        "code": "UNVERIFIED_PACKAGE",
        "message": "Could not verify: mind-auth"
      }]
    },
    "selfAssessment": {
      "confidence": 0.85,
      "completeness": 0.90,
      "gaps": ["Не описаны внутренние зависимости"],
      "reasoning": "Нашёл все основные пакеты через fs:list, но не исследовал package.json для зависимостей"
    }
  }
}
```

---

## Убираем scope extraction костыль

После внедрения верификации можно убрать `extractScope()` из orchestrator.ts потому что:

1. Верификация поймает если агент упоминает файлы не из нужной папки
2. Self-assessment покажет низкую confidence если агент не уверен
3. Warning `UNVERIFIED_FILE` укажет на проблемные упоминания

**Альтернатива scope extraction:**
- Просто передавать в prompt информацию о структуре проекта
- Верификация post-hoc надёжнее чем pre-filtering

---

## Порядок реализации

1. **Phase 1**: Contracts (types, events) - ~30 min
2. **Phase 2**: AgentVerifier - ~1 hour
3. **Phase 3**: SelfAssessment - ~45 min
4. **Phase 4**: Agent integration - ~30 min
5. **Phase 5**: Orchestrator integration - ~30 min
6. **Phase 6**: Testing & tuning - ~1 hour

**Общее время: ~4-5 часов**

---

## Тестирование

1. **Unit tests**: AgentVerifier.extractMentions(), .verify()
2. **Unit tests**: parseSelfAssessment()
3. **Integration test**: Запрос с заведомо правильным ответом → high confidence
4. **Integration test**: Запрос с выдуманными пакетами → low confidence, warnings
5. **E2E test**: Запуск через API, проверка events

---

## Ожидаемые результаты

### Автоматические действия оркестратора

| Проблема | Сейчас | После |
|----------|--------|-------|
| Галлюцинация в subtask | Попадает в финальный ответ | Retry с предупреждением |
| Низкая confidence | Не знаем, что плохо | Reformulate + retry |
| Неполный ответ | Не знаем, что упущено | Follow-up subtasks для gaps |
| Противоречия | Не детектируются | Warning + запрос уточнения |

### Метрики качества

| Метрика | Сейчас | Ожидание |
|---------|--------|----------|
| Галлюцинации в финальном ответе | ~20-30% | <5% |
| Ответы с unverified mentions | Не знаем | <10% после retries |
| Неполные ответы без gaps | Все | 0% (gaps всегда видны) |

### Пример улучшения

**Задача:** "Расскажи про систему плагинов V3"

**Сейчас (без верификации):**
```
Subtask 1: "mind-auth пакет отвечает за..." ← галлюцинация
Subtask 2: "plugin-runtime содержит..." ← ок
Synthesis: включает mind-auth ← галлюцинация в финальном ответе
```

**После (с верификацией):**
```
Subtask 1: verification.unverified = ["mind-auth"] → RETRY
Subtask 1 (retry): "plugin-manifest пакет..." ← ок
Subtask 2: verification.confidence = 0.85 ← ок
Synthesis: только проверенные пакеты, gaps: ["internal dependencies"]
```

---

## Phase 7: Интеграция с памятью (~80 LOC)

### Архитектура памяти

Существующая система памяти (`file-memory.ts`):
- **Session Memory** (`.kb/memory/session-xxx/`) — коррекции, находки, блокеры
- **Shared Memory** (`.kb/memory/shared/`) — предпочтения пользователя (read-only)
- **Методы**: `addFinding()`, `addBlocker()`, `addUserCorrection()`, `getStructuredContext()`

### Как верификация интегрируется с памятью

```
┌─────────────────────────────────────────────────────────────────┐
│                      Orchestrator                                │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │  Subtask 1   │───►│   Verifier   │───►│   Memory     │      │
│  │  (Agent A)   │    │  (medium)    │    │   Writer     │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                             │                    │               │
│                             ▼                    ▼               │
│                    ┌──────────────┐    ┌──────────────────┐     │
│                    │  Verification │    │ session-xxx/      │    │
│                    │  Result       │    │  ├─ findings/     │    │
│                    │  {            │───►│  │  └─ verified   │    │
│                    │   confidence, │    │  ├─ blockers/     │    │
│                    │   gaps,       │    │  │  └─ unverified │    │
│                    │   warnings    │    │  └─ corrections/  │    │
│                    │  }            │    └──────────────────┘     │
│                    └──────────────┘                              │
│                                                                  │
│  ┌──────────────┐                       ┌──────────────────┐     │
│  │  Subtask 2   │──────────────────────►│ getContext()     │     │
│  │  (Agent B)   │◄──────────────────────│ • verified facts │     │
│  └──────────────┘                       │ • known blockers │     │
│                                         │ • past gaps      │     │
│                                         └──────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

### Что записывается в память

| Verification Result | → Memory Type | Использование |
|---------------------|---------------|---------------|
| `verified` mentions | `finding` (высокий confidence) | Следующие агенты доверяют этим фактам |
| `unverified` mentions | `blocker` | Следующие агенты избегают этих упоминаний |
| `gaps` | `finding` (низкий confidence) | Приоритизация для follow-up tasks |
| `warnings` | `blocker` | Предупреждения для следующих subtasks |
| `confidence < 0.5` | `blocker` | Пометка ненадёжного результата |

### Файл: `agent-core/src/memory/verification-memory.ts`

```typescript
/**
 * Integration between Verification and Memory systems
 *
 * Stores verification results in session memory so that:
 * - Next subtasks know which facts are verified
 * - Next subtasks avoid using unverified mentions
 * - Orchestrator can prioritize gaps
 */

import type { FileMemory } from './file-memory.js';
import type { VerificationOutput } from '../verification/cross-tier-verifier.js';

export interface VerificationMemoryEntry {
  subtaskId: string;
  task: string;
  verification: VerificationOutput;
  timestamp: string;
}

/**
 * Store verification results in session memory
 */
export async function storeVerificationInMemory(
  memory: FileMemory,
  subtaskId: string,
  task: string,
  verification: VerificationOutput
): Promise<void> {
  const timestamp = new Date().toISOString();

  // 1. Verified mentions → findings (можно доверять)
  if (verification.verified.length > 0) {
    await memory.addFinding({
      id: `verified-${subtaskId}`,
      content: `Verified entities for "${task.slice(0, 50)}...": ${verification.verified.join(', ')}`,
      confidence: verification.confidence,
      source: subtaskId,
      timestamp,
    });
  }

  // 2. Unverified mentions → blockers (не использовать!)
  if (verification.unverified.length > 0) {
    await memory.addBlocker({
      id: `unverified-${subtaskId}`,
      reason: `DO NOT reference these (unverified/hallucinated): ${verification.unverified.join(', ')}`,
      severity: 'warning',
      source: subtaskId,
      timestamp,
    });
  }

  // 3. Low confidence → blocker
  if (verification.confidence < 0.5) {
    await memory.addBlocker({
      id: `low-conf-${subtaskId}`,
      reason: `Low confidence result (${verification.confidence}) for "${task.slice(0, 30)}...". Gaps: ${verification.gaps.join(', ')}`,
      severity: 'warning',
      source: subtaskId,
      timestamp,
    });
  }

  // 4. Gaps → findings (low confidence) for follow-up prioritization
  if (verification.gaps.length > 0) {
    await memory.addFinding({
      id: `gaps-${subtaskId}`,
      content: `Unanswered aspects: ${verification.gaps.join('; ')}`,
      confidence: 0.3, // Low confidence = needs addressing
      source: subtaskId,
      timestamp,
    });
  }
}

/**
 * Build context for next subtask based on verification history
 */
export async function buildVerificationContext(
  memory: FileMemory
): Promise<string> {
  const context = await memory.getStructuredContext();

  const parts: string[] = [];

  // Verified facts (can trust)
  const verifiedFindings = context.findings.filter(f =>
    f.id.startsWith('verified-') && f.confidence >= 0.7
  );
  if (verifiedFindings.length > 0) {
    parts.push('## Verified Facts (can trust)');
    for (const f of verifiedFindings.slice(0, 10)) {
      parts.push(`- ${f.content}`);
    }
  }

  // Blockers (avoid these)
  const unverifiedBlockers = context.blockers.filter(b =>
    b.id.startsWith('unverified-')
  );
  if (unverifiedBlockers.length > 0) {
    parts.push('\n## Known Hallucinations (AVOID referencing)');
    for (const b of unverifiedBlockers.slice(0, 10)) {
      parts.push(`- ${b.reason}`);
    }
  }

  // Gaps (needs addressing)
  const gapFindings = context.findings.filter(f =>
    f.id.startsWith('gaps-')
  );
  if (gapFindings.length > 0) {
    parts.push('\n## Known Gaps (may need to address)');
    for (const g of gapFindings.slice(0, 5)) {
      parts.push(`- ${g.content}`);
    }
  }

  return parts.join('\n');
}
```

### Использование в оркестраторе

```typescript
// После верификации subtask — записываем в память
async function handleSubtaskResult(subtask, result, verification) {
  // 1. Store in memory for next subtasks
  await storeVerificationInMemory(
    this.memory,
    subtask.id,
    subtask.task,
    verification
  );

  // 2. Handle based on verification (retry, reformulate, etc.)
  // ... existing logic ...
}

// Перед запуском subtask — читаем контекст из памяти
async function executeSubtaskWithContext(subtask) {
  const verificationContext = await buildVerificationContext(this.memory);

  const systemPrompt = `
You are working on: ${subtask.task}

${verificationContext}

IMPORTANT:
- Trust "Verified Facts" as reliable sources
- NEVER reference anything from "Known Hallucinations"
- Consider addressing "Known Gaps" if relevant
`;

  return await this.agent.execute(subtask.task, { systemPrompt });
}
```

### Пример: как память влияет на следующий subtask

**Subtask 1:** "Найди пакеты в kb-labs-mind"
```
Ответ: "mind-engine, mind-cli, mind-auth, mind-orchestrator"
Verification: unverified = ["mind-auth"]
→ Memory: blocker "DO NOT reference: mind-auth"
```

**Subtask 2:** "Опиши архитектуру kb-labs-mind"
```
System prompt включает:
## Known Hallucinations (AVOID referencing)
- DO NOT reference: mind-auth

## Verified Facts (can trust)
- Verified entities: mind-engine, mind-cli, mind-orchestrator

→ Агент 2 знает, что mind-auth не существует и не упоминает его
```

### Cross-session память (Shared)

Для persistent паттернов можно использовать shared memory:

```typescript
// Если определённые галлюцинации повторяются
if (isRecurringHallucination(verification.unverified)) {
  await memory.addToShared('constraints', {
    id: 'recurring-hallucination',
    content: `Common hallucinations to avoid: ${verification.unverified.join(', ')}`,
    source: 'verification-system',
  });
}
```

Это сохранится между сессиями и будет включаться в контекст всех будущих агентов.

---

## Обновлённые файлы

| Файл | Действие | LOC |
|------|----------|-----|
| `agent-contracts/src/verification.ts` | CREATE | ~40 |
| `agent-contracts/src/types.ts` | MODIFY | ~15 |
| `agent-contracts/src/events.ts` | MODIFY | ~25 |
| `agent-contracts/src/index.ts` | MODIFY | ~2 |
| `agent-core/src/verification/cross-tier-verifier.ts` | CREATE | ~120 |
| `agent-core/src/verification/tool-results-summarizer.ts` | CREATE | ~60 |
| `agent-core/src/verification/index.ts` | CREATE | ~10 |
| `agent-core/src/memory/verification-memory.ts` | CREATE | ~80 |
| `agent-core/src/agent.ts` | MODIFY | ~50 |
| `agent-core/src/orchestrator.ts` | MODIFY | ~60 |
| `agent-core/src/index.ts` | MODIFY | ~5 |

**Итого: ~470 LOC**

---

## Будущие улучшения

1. **Semantic verification** - использовать Mind RAG для проверки что упоминаемые концепции реальны
2. **Historical confidence** - учитывать confidence предыдущих ответов агента
3. **Adaptive retry strategy** - менять подход в зависимости от типа ошибки
4. **Confidence calibration** - калибровать оценки на основе фактической точности
5. **Verification caching** - кешировать результаты для повторяющихся паттернов
6. **Cross-subtask validation** - проверять согласованность между subtask результатами

---

## Сравнение подходов

| Подход | Bias | Точность extraction | Стоимость | Надёжность |
|--------|------|---------------------|-----------|------------|
| Self-assessment (old) | Высокий | Regex (низкая) | 1 small call | Низкая |
| **Cross-tier (new)** | **Низкий** | **LLM (высокая)** | **1 medium call** | **Высокая** |
| Dual-model | Нулевой | LLM | 2 calls | Очень высокая |

Cross-tier - оптимальный баланс между стоимостью и качеством.
