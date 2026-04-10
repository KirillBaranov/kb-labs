# Предложение по улучшению Release Manager: интеграция Mind + LLM

**Дата**: 2025-01-27  
**Статус**: Предложение  
**Приоритет**: Высокий

## 🎯 Цель

Расширить возможности Release Manager за счет:
1. **Интеграции с kb-labs-mind** — получение семантической информации об изменениях (схемы, связи, контекст)
2. **Обработки через LLM** — улучшение качества changelog, автоматическое определение breaking changes, генерация понятных описаний

---

## 📊 Текущее состояние

### Что уже работает

- ✅ Парсинг conventional commits из git истории
- ✅ Группировка по типам (feat, fix, perf, etc.)
- ✅ Базовое форматирование в Markdown/JSON
- ✅ Определение измененных пакетов по файлам
- ✅ Ссылки на коммиты и PR

### Ограничения

- ❌ Нет информации о **схемах**, которые изменились
- ❌ Нет понимания **связей** между изменениями
- ❌ Описания коммитов часто **технические** и не понятны пользователям
- ❌ Breaking changes определяются только по **явным маркерам** в коммитах
- ❌ Нет **семантического анализа** влияния изменений

---

## 🚀 Предлагаемые улучшения

### 1. Интеграция с kb-labs-mind

#### 1.1. Получение информации о схемах

**Что получаем от mind:**
- Список измененных схем/документов между версиями
- Типы изменений (добавление полей, удаление, изменение типов)
- Связи между схемами (какие схемы зависят от измененных)
- Метаданные о важности изменений

**Реализация:**

```typescript
// packages/changelog/src/mind-enhancer.ts

import type { Change, PackageRelease } from './types';
import type { ShellApi } from '@kb-labs/plugin-contracts';

export interface MindEnhancement {
  schemaChanges: SchemaChange[];
  affectedDocuments: string[];
  breakingChanges: BreakingChange[];
  impact: 'low' | 'medium' | 'high' | 'critical';
}

export interface SchemaChange {
  schemaId: string;
  changeType: 'added' | 'removed' | 'modified' | 'deprecated';
  field?: string;
  oldType?: string;
  newType?: string;
  breaking: boolean;
}

/**
 * Enhance changelog changes with Mind knowledge via CLI
 * Uses `kb mind query` command through ctx.runtime.shell (sandbox-safe)
 * 
 * IMPORTANT: In sandbox environment, must use ctx.runtime.shell instead of execa
 * Shell execution requires 'shell:execute' capability in manifest permissions
 */
export async function enhanceWithMind(
  changes: Change[],
  from: string,
  to: string,
  cwd: string,
  shell?: ShellApi  // Passed from ctx.runtime.shell in CLI commands
): Promise<Map<string, MindEnhancement>> {
  const enhancements = new Map<string, MindEnhancement>();
  
  if (!shell) {
    // No shell available - graceful degradation
    console.warn('Shell API not available, skipping mind enhancements');
    for (const change of changes) {
      enhancements.set(change.sha, {
        schemaChanges: [],
        affectedDocuments: [],
        breakingChanges: [],
        impact: 'low',
      });
    }
    return enhancements;
  }
  
  // Query mind via CLI for schema changes between versions
  for (const change of changes) {
    try {
      // Execute `kb mind query` command through sandbox-safe shell API
      const result = await shell.exec('kb', [
        'mind',
        'query',
        '--json',
        '--query', `
          SELECT schema_changes 
          WHERE commit_sha = $sha 
          AND change_type IN ('added', 'removed', 'modified')
        `,
        '--params', JSON.stringify({ sha: change.sha }),
      ], {
        cwd,
        timeoutMs: 30000, // 30 second timeout
      });
      
      if (!result.ok) {
        throw new Error(`Mind query failed: ${result.stderr}`);
      }
      
      const data = JSON.parse(result.stdout);
      const schemaChanges = parseSchemaChanges(data);
      
      // Analyze impact
      const breaking = schemaChanges.some(sc => sc.breaking);
      const impact = calculateImpact(schemaChanges);
      
      enhancements.set(change.sha, {
        schemaChanges,
        affectedDocuments: extractDocuments(schemaChanges),
        breakingChanges: breaking ? [{ summary: 'Schema change detected' }] : [],
        impact,
      });
    } catch (error) {
      // Graceful degradation: if mind query fails, skip enhancement
      console.warn(`Failed to query mind for commit ${change.sha}:`, error);
      enhancements.set(change.sha, {
        schemaChanges: [],
        affectedDocuments: [],
        breakingChanges: [],
        impact: 'low',
      });
    }
  }
  
  return enhancements;
}

/**
 * Batch query mind for multiple commits at once
 * More efficient than individual queries
 */
export async function enhanceWithMindBatch(
  changes: Change[],
  from: string,
  to: string,
  cwd: string,
  shell?: ShellApi
): Promise<Map<string, MindEnhancement>> {
  const enhancements = new Map<string, MindEnhancement>();
  
  if (!shell) {
    // Graceful degradation
    for (const change of changes) {
      enhancements.set(change.sha, {
        schemaChanges: [],
        affectedDocuments: [],
        breakingChanges: [],
        impact: 'low',
      });
    }
    return enhancements;
  }
  
  // Group commits by package for batch queries
  const commitsByPackage = new Map<string, Change[]>();
  for (const change of changes) {
    const pkg = change.packages[0] || 'global';
    if (!commitsByPackage.has(pkg)) {
      commitsByPackage.set(pkg, []);
    }
    commitsByPackage.get(pkg)!.push(change);
  }
  
  // Query mind for each package batch
  for (const [pkg, pkgChanges] of commitsByPackage) {
    try {
      const shas = pkgChanges.map(c => c.sha);
      
      const result = await shell.exec('kb', [
        'mind',
        'query',
        '--json',
        '--query', `
          SELECT schema_changes 
          WHERE commit_sha IN ($shas)
          AND package = $pkg
          AND change_type IN ('added', 'removed', 'modified')
        `,
        '--params', JSON.stringify({ shas, pkg }),
      ], {
        cwd,
        timeoutMs: 60000, // 60 second timeout for batch queries
      });
      
      if (!result.ok) {
        throw new Error(`Mind batch query failed: ${result.stderr}`);
      }
      
      const data = JSON.parse(result.stdout);
      const schemaChangesBySha = parseSchemaChangesBatch(data);
      
      // Map results back to changes
      for (const change of pkgChanges) {
        const schemaChanges = schemaChangesBySha.get(change.sha) || [];
        const breaking = schemaChanges.some(sc => sc.breaking);
        const impact = calculateImpact(schemaChanges);
        
        enhancements.set(change.sha, {
          schemaChanges,
          affectedDocuments: extractDocuments(schemaChanges),
          breakingChanges: breaking ? [{ summary: 'Schema change detected' }] : [],
          impact,
        });
      }
    } catch (error) {
      // Graceful degradation
      console.warn(`Failed to batch query mind for package ${pkg}:`, error);
      for (const change of pkgChanges) {
        enhancements.set(change.sha, {
          schemaChanges: [],
          affectedDocuments: [],
          breakingChanges: [],
          impact: 'low',
        });
      }
    }
  }
  
  return enhancements;
}
```

**Использование в CLI команде:**

```typescript
// packages/release-cli/src/cli/commands/changelog.ts

export const changelog: Command = {
  name: 'release:changelog',
  async run(ctx, argv, flags) {
    const cwd = ctx?.cwd || process.cwd();
    
    // Get shell API from runtime context (sandbox-safe)
    const shell = ctx?.runtime?.shell;
    
    // Parse commits
    const changes = await parseCommits({ cwd, from: flags.from, to: flags.to });
    
    // Enhance with mind if enabled and shell available
    let mindEnhancements: Map<string, MindEnhancement> | undefined;
    if (flags.mind && shell) {
      mindEnhancements = await enhanceWithMind(changes, flags.from, flags.to, cwd, shell);
    }
    
    // ... rest of changelog generation
  },
};
```

#### 1.2. Использование в changelog

**Добавляем секцию "Schema Changes":**

```markdown
## Schema Changes

- **@kb-labs/core**: Added field `metadata` to `UserSchema` (breaking)
- **@kb-labs/api**: Removed deprecated `v1` endpoint schema
- **@kb-labs/mind**: Modified `DocumentSchema.type` from `string` to `enum`
```

#### 1.3. Определение влияния на зависимости

**Mind может показать:**
- Какие пакеты используют измененные схемы
- Какие API endpoints затронуты
- Какие документы нужно обновить

---

### 2. Обработка через LLM

#### 2.1. Улучшение описаний коммитов

**Проблема:** Коммиты часто содержат технические детали:
```
fix: resolve null pointer in UserService.getById()
```

**Решение:** LLM генерирует понятное описание:
```
fix: Fixed crash when loading user profile without ID
```

**Реализация:**

```typescript
// packages/changelog/src/llm-enhancer.ts

import { estimateTokens } from '@kb-labs/shared-textops';
import type { Change } from './types';

export interface LLMEnhancement {
  improvedSubject: string;
  improvedBody?: string;
  userFriendlyDescription: string;
  impact: 'low' | 'medium' | 'high';
  category: 'bug' | 'feature' | 'improvement' | 'breaking';
}

/**
 * Enhance commit message with LLM
 */
export async function enhanceWithLLM(
  change: Change,
  options: {
    provider?: 'openai' | 'anthropic' | 'local';
    model?: string;
    context?: string; // Additional context from mind
  }
): Promise<LLMEnhancement> {
  const prompt = buildPrompt(change, options.context);
  
  // Call LLM API (через @kb-labs/ai-review или новый провайдер)
  const response = await callLLM({
    provider: options.provider || 'openai',
    model: options.model || 'gpt-4-turbo',
    prompt,
    maxTokens: 200,
  });
  
  return parseLLMResponse(response);
}

function buildPrompt(change: Change, context?: string): string {
  return `
You are a technical writer improving changelog entries.

Original commit:
- Type: ${change.type}
- Scope: ${change.scope || 'none'}
- Subject: ${change.subject}
- Body: ${change.body || 'none'}
${context ? `\nContext from code analysis:\n${context}` : ''}

Generate:
1. Improved subject (clear, user-friendly, max 72 chars)
2. User-friendly description (1-2 sentences explaining what changed and why)
3. Impact level (low/medium/high)
4. Category (bug/feature/improvement/breaking)

Format as JSON:
{
  "improvedSubject": "...",
  "userFriendlyDescription": "...",
  "impact": "...",
  "category": "..."
}
  `.trim();
}
```

#### 2.2. Автоматическое определение Breaking Changes

**Проблема:** Breaking changes часто не помечены явно

**Решение:** LLM анализирует код и определяет breaking changes:

```typescript
export async function detectBreakingChanges(
  changes: Change[],
  gitDiff: string,
  mindContext: MindEnhancement[]
): Promise<BreakingChange[]> {
  const breakingChanges: BreakingChange[] = [];
  
  for (const change of changes) {
    // Skip if already marked as breaking
    if (change.breaking) continue;
    
    const prompt = `
Analyze this code change and determine if it's a breaking change:

Commit: ${change.subject}
Files changed: ${change.filesChanged.join(', ')}
Schema changes: ${JSON.stringify(mindContext.find(m => m.sha === change.sha)?.schemaChanges || [])}

Diff:
${gitDiff}

Is this a breaking change? Consider:
- API signature changes
- Removed exports
- Changed parameter types
- Changed return types
- Schema field removals
- Changed default values

Respond with JSON:
{
  "isBreaking": boolean,
  "reason": "explanation",
  "affected": ["list of affected areas"]
}
    `;
    
    const analysis = await callLLM({ prompt });
    
    if (analysis.isBreaking) {
      breakingChanges.push({
        summary: analysis.reason,
        affected: analysis.affected,
      });
    }
  }
  
  return breakingChanges;
}
```

#### 2.3. Генерация итогового релиз-ноута

**LLM генерирует финальный релиз-ноут на основе всех изменений:**

```typescript
export async function generateReleaseNotes(
  packageReleases: PackageRelease[],
  mindEnhancements: Map<string, MindEnhancement>,
  llmEnhancements: Map<string, LLMEnhancement>
): Promise<string> {
  const prompt = `
Generate a comprehensive release notes document for this release:

Packages released:
${packageReleases.map(p => `- ${p.name}: ${p.prev} → ${p.next}`).join('\n')}

Changes:
${packageReleases.flatMap(p => p.changes.map(c => {
  const llm = llmEnhancements.get(c.sha);
  return `- [${c.type}] ${llm?.improvedSubject || c.subject}`;
})).join('\n')}

Schema changes:
${Array.from(mindEnhancements.values()).flatMap(m => 
  m.schemaChanges.map(sc => `- ${sc.schemaId}: ${sc.changeType}`)
).join('\n')}

Generate:
1. Executive summary (2-3 sentences)
2. What's new (features)
3. Bug fixes
4. Breaking changes (if any)
5. Migration guide (if breaking changes)
6. Contributors

Format as Markdown.
  `;
  
  return await callLLM({ prompt, maxTokens: 2000 });
}
```

---

## 🏗️ Архитектура

### Новые пакеты/модули

```
packages/
├── changelog/
│   ├── src/
│   │   ├── mind-enhancer.ts      # Интеграция с mind
│   │   ├── llm-enhancer.ts        # Интеграция с LLM
│   │   └── formatters/
│   │       └── enhanced-markdown.ts  # Улучшенный форматтер
│   └── ...
└── release-core/
    └── src/
        └── release-notes-generator.ts  # Генератор релиз-ноутов
```

### Зависимости

```json
{
  "dependencies": {
    "execa": "^8.0.0",
    "@kb-labs/shared-textops": "link:../../../kb-labs-shared/packages/textops"
  }
}
```

**Важно**: Интеграция с mind происходит через CLI команду `kb mind query` через `ctx.runtime.shell`, а не через прямые вызовы execa. Это обеспечивает:
- **Sandbox-safe выполнение**: Работает в sandbox окружении с ограниченными правами
- **Единообразный интерфейс**: Использование существующей инфраструктуры CLI
- **Безопасность**: Контроль прав доступа через manifest permissions
- **Независимость**: От внутренней реализации mind
- **Graceful degradation**: Если shell недоступен, работает без mind данных

**Требования к manifest permissions:**

```typescript
// В manifest.v2.ts для команды changelog
permissions: {
  shell: {
    execute: true,  // Разрешить выполнение shell команд
    allowedCommands: ['kb'],  // Разрешить только команду 'kb'
  },
  // ... другие права
}
```

Для LLM можно использовать:
- Существующий `@kb-labs/ai-review` как провайдер
- Или создать новый `@kb-labs/llm-provider` для универсального использования

---

## 📋 План реализации

### Фаза 1: Интеграция Mind (2-3 недели)

1. **Неделя 1:**
   - [ ] Добавить `mind-enhancer.ts` в `changelog`
   - [ ] Реализовать вызовы `kb mind query` через `ctx.runtime.shell` (ShellApi)
   - [ ] Добавить права `shell:execute` в manifest permissions для команды changelog
   - [ ] Добавить проверку доступности `ctx.runtime.shell` перед использованием
   - [ ] Реализовать graceful degradation при недоступности shell или mind
   - [ ] Добавить типы для `SchemaChange`, `MindEnhancement`
   - [ ] Тесты для mind интеграции (с моками ShellApi)

2. **Неделя 2:**
   - [ ] Обновить форматтер markdown для отображения schema changes
   - [ ] Добавить секцию "Schema Changes" в changelog
   - [ ] Интеграция с командой `kb release changelog`

3. **Неделя 3:**
   - [ ] Документация
   - [ ] E2E тесты

### Фаза 2: Интеграция LLM (3-4 недели)

1. **Неделя 1:**
   - [ ] Создать `llm-enhancer.ts`
   - [ ] Интегрировать LLM провайдер (через ai-review или новый)
   - [ ] Реализовать `enhanceWithLLM()` для улучшения описаний
   - [ ] Тесты

2. **Неделя 2:**
   - [ ] Реализовать `detectBreakingChanges()` через LLM
   - [ ] Интегрировать с процессом планирования релиза
   - [ ] Кэширование результатов LLM (чтобы не вызывать повторно)

3. **Неделя 3:**
   - [ ] Реализовать `generateReleaseNotes()`
   - [ ] Добавить флаг `--ai` в команду `kb release changelog`
   - [ ] Обновить форматтеры для использования LLM-улучшенных описаний

4. **Неделя 4:**
   - [ ] Документация
   - [ ] Примеры использования
   - [ ] E2E тесты

### Фаза 3: Оптимизация и полировка (1-2 недели)

1. **Оптимизация:**
   - [ ] Батчинг LLM запросов (обрабатывать несколько коммитов за раз)
   - [ ] Кэширование результатов
   - [ ] Fallback на оригинальные описания при ошибках LLM

2. **UX улучшения:**
   - [ ] Прогресс-бар для LLM обработки
   - [ ] Опция `--no-ai` для отключения LLM
   - [ ] Конфигурация LLM провайдера в `kb-labs.config.json`

---

## ⚙️ Конфигурация

### kb-labs.config.json

```json
{
  "release": {
    "changelog": {
      "enhancements": {
        "mind": {
          "enabled": true,
          "includeSchemaChanges": true,
          "includeImpactAnalysis": true
        },
        "llm": {
          "enabled": true,
          "provider": "openai",
          "model": "gpt-4-turbo",
          "improveDescriptions": true,
          "detectBreakingChanges": true,
          "generateReleaseNotes": true,
          "cache": true
        }
      }
    }
  }
}
```

### Переменные окружения

```bash
# LLM Provider
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Mind
MIND_ENGINE_PATH=.kb/mind
```

---

## 🎯 Примеры использования

### Базовое использование (без улучшений)

```bash
kb release changelog --from v1.0.0
```

### С интеграцией Mind

```bash
# Использует `kb mind query` для получения информации о схемах
kb release changelog --from v1.0.0 --mind

# Если mind недоступен, работает в режиме graceful degradation
# (показывает предупреждение, но продолжает работу без mind данных)
```

### С интеграцией LLM

```bash
kb release changelog --from v1.0.0 --ai
```

### Полная интеграция

```bash
kb release changelog --from v1.0.0 --mind --ai --level detailed
```

### Генерация релиз-ноутов

```bash
kb release changelog --from v1.0.0 --ai --generate-release-notes
```

---

## 📊 Ожидаемые результаты

### До улучшений

```markdown
## Features
- feat(core): add UserService.getById() method
- feat(api): implement /users endpoint

## Bug Fixes
- fix(core): resolve null pointer in UserService
```

### После улучшений

```markdown
## Features
- **User Management**: Added ability to fetch user profiles by ID
  - New `UserService.getById()` method with error handling
  - Impact: Medium | Affects: @kb-labs/api, @kb-labs/core
  
- **API Endpoints**: New `/users` endpoint for user operations
  - Supports GET, POST, PUT operations
  - Impact: High | Affects: All API consumers

## Schema Changes
- **@kb-labs/core**: Added `metadata` field to `UserSchema`
  - Type: `Record<string, unknown>`
  - Breaking: No (optional field)

## Bug Fixes
- **User Service**: Fixed crash when loading user without ID
  - Previously: Null pointer exception
  - Now: Returns 404 error with proper message
  - Impact: High | Affects: All user operations
```

---

## ⚠️ Риски и ограничения

### Риски

1. **Производительность LLM:**
   - Запросы к LLM могут быть медленными
   - **Решение**: Батчинг, кэширование, асинхронная обработка

2. **Стоимость LLM:**
   - Много коммитов = много запросов = высокая стоимость
   - **Решение**: Кэширование, опциональное использование, локальные модели

3. **Зависимость от mind CLI и shell прав:**
   - Если `kb mind query` недоступен или не настроен, часть функций не работает
   - Если `ctx.runtime.shell` недоступен (нет прав в sandbox), mind интеграция отключается
   - **Решение**: Graceful degradation, fallback на базовую функциональность, проверка доступности shell API перед использованием

4. **Производительность CLI вызовов:**
   - Вызовы `kb mind query` через `ctx.runtime.shell` могут быть медленнее прямых API вызовов
   - Каждый вызов создает новый процесс
   - **Решение**: Батчинг запросов, кэширование результатов, параллельное выполнение через spawn

5. **Sandbox ограничения:**
   - В sandbox окружении нельзя использовать execa напрямую
   - Требуются явные права `shell:execute` в manifest
   - **Решение**: Всегда использовать `ctx.runtime.shell`, проверять доступность перед использованием

6. **Качество LLM ответов:**
   - LLM может генерировать неточные описания
   - **Решение**: Валидация, возможность редактирования, fallback на оригиналы

### Ограничения

- Требует доступности команды `kb mind query` (mind должен быть установлен и настроен)
- Требует права `shell:execute` в manifest permissions для выполнения команд
- Требует API ключи для LLM провайдеров
- Увеличивает время генерации changelog (особенно с LLM и CLI вызовами)
- Зависит от формата вывода `kb mind query --json` (может измениться в будущих версиях)
- В sandbox окружении работает только через `ctx.runtime.shell`, не через execa

---

## 🔄 Альтернативные подходы

### Вариант 1: Минимальная интеграция

Только Mind, без LLM:
- ✅ Быстрее
- ✅ Дешевле
- ❌ Меньше улучшений UX

### Вариант 2: Только LLM

Только LLM, без Mind:
- ✅ Проще реализация
- ❌ Нет информации о схемах
- ❌ Меньше контекста для LLM

### Вариант 3: Полная интеграция (рекомендуется)

Mind + LLM:
- ✅ Максимальные возможности
- ✅ Лучшее качество changelog
- ❌ Сложнее реализация

---

## 📈 Метрики успеха

1. **Качество changelog:**
   - Увеличение читаемости (subjective, но можно измерить через длину предложений, использование технических терминов)
   - Уменьшение количества технических терминов в пользовательских описаниях

2. **Автоматизация:**
   - Процент breaking changes, обнаруженных автоматически
   - Время на ручное редактирование changelog (должно уменьшиться)

3. **Покрытие:**
   - Процент коммитов с улучшенными описаниями
   - Процент релизов с информацией о схемах

---

## 🎉 Заключение

Интеграция Mind + LLM значительно улучшит качество changelog и автоматизацию процесса релизов:

✅ **Mind** даст семантический контекст об изменениях  
✅ **LLM** улучшит читаемость и автоматически найдет breaking changes  
✅ **Комбинация** создаст профессиональные релиз-ноуты

**Рекомендация**: Начать с Фазы 1 (Mind), затем добавить Фазу 2 (LLM) после оценки результатов.

