# План улучшений RAG-системы Mind для решения проблем с контекстом

**Дата:** 2025-01-XX  
**Статус:** Предложение  
**Приоритет:** Высокий

## Проблемы текущей реализации

### 1. Качество эмбеддингов
- ❌ Детерминированный провайдер не дает семантического понимания
- ❌ Нет поддержки реальных embedding моделей (OpenAI, Cohere, local)
- ❌ Фиксированная размерность (384) может быть неоптимальной

### 2. Стратегия chunking
- ❌ Простое разбиение по строкам без учета структуры кода
- ❌ Не учитывает синтаксические границы (функции, классы, блоки)
- ❌ Нет адаптивного chunking под тип контента
- ❌ Перекрытие фиксированное, не учитывает семантику

### 3. Качество поиска
- ❌ Только векторный поиск, нет гибридного (векторный + ключевые слова)
- ❌ Нет ре-ранкинга результатов с помощью LLM
- ❌ Нет query expansion (расширение запроса)
- ❌ Нет метаданных для улучшенной фильтрации

### 4. Контекст для LLM
- ❌ Нет дедупликации похожих чанков
- ❌ Нет ранжирования по релевантности к запросу
- ❌ Нет адаптивного выбора количества чанков под токен-бюджет
- ❌ Нет компрессии контекста (summarization)

### 5. Метаданные и фильтрация
- ❌ Минимальные метаданные (только kind, language)
- ❌ Нет извлечения структуры кода (функции, классы, типы)
- ❌ Нет тегов и категорий
- ❌ Нет временных меток (когда файл изменялся)

### 6. Производительность и масштабирование
- ❌ Хранение в JSON файлах не масштабируется
- ❌ Нет индексов для быстрого поиска
- ❌ Нет инкрементальной индексации
- ❌ Полный пересчет при каждом обновлении

## Предлагаемые улучшения

### Фаза 1: Улучшение качества эмбеддингов (Критично)

#### 1.1 Поддержка реальных embedding провайдеров

```typescript
// packages/mind-embeddings/src/providers/

interface EmbeddingProviderConfig {
  type: 'deterministic' | 'openai' | 'cohere' | 'local' | 'ollama';
  model?: string;
  apiKey?: string;
  dimension?: number;
  batchSize?: number;
}

// OpenAI провайдер
export function createOpenAIEmbeddingProvider(
  config: { apiKey: string; model?: string }
): EmbeddingProvider {
  return {
    id: 'openai',
    async embed(texts: string[]) {
      // Использование text-embedding-3-small/large
      // Поддержка batch requests
    }
  };
}

// Local модели (через Ollama или локальные)
export function createLocalEmbeddingProvider(
  config: { model: string; endpoint?: string }
): EmbeddingProvider {
  // Поддержка local models: nomic-embed, all-MiniLM-L6-v2, etc.
}
```

**Преимущества:**
- Реальное семантическое понимание
- Лучшая релевантность результатов
- Поддержка разных моделей под задачи

**Оценка:** 8-12 часов

#### 1.2 Кэширование эмбеддингов

```typescript
interface EmbeddingCache {
  get(text: string, hash: string): Promise<EmbeddingVector | null>;
  set(text: string, hash: string, embedding: EmbeddingVector): Promise<void>;
  invalidate(pattern: string): Promise<void>;
}

// Кэш на основе SHA256 текста
// Хранение в .kb/mind/embeddings-cache/
```

**Преимущества:**
- Экономия API calls
- Быстрая повторная индексация
- Снижение затрат

**Оценка:** 4-6 часов

---

### Фаза 2: Умный chunking (Критично)

#### 2.1 Синтаксически-осознанный chunking для кода

```typescript
interface SmartChunkingOptions {
  strategy: 'syntax-aware' | 'semantic' | 'fixed-lines';
  preserveBoundaries: boolean; // Не разрывать функции/классы
  minChunkSize: number;
  maxChunkSize: number;
  overlapStrategy: 'fixed' | 'semantic';
}

class SyntaxAwareChunker {
  // Использование Tree-sitter или TypeScript AST
  chunkFile(file: string, content: string): MindChunk[] {
    const ast = parseAST(content);
    const functions = extractFunctions(ast);
    const classes = extractClasses(ast);
    
    // Группировка по логическим блокам
    return groupBySemanticUnits(functions, classes);
  }
}
```

**Пример для TypeScript:**

```typescript
// Вместо разбиения по строкам:
// chunk1: lines 1-120 (может разорвать функцию)
// chunk2: lines 101-220

// Синтаксически-осознанный:
// chunk1: function authenticate() { ... } + связанные типы
// chunk2: class UserService { ... } + методы
```

**Преимущества:**
- Чанки не разрывают логические единицы
- Лучшая релевантность (полные функции/классы)
- Меньше потеря контекста

**Оценка:** 16-24 часа

#### 2.2 Адаптивный chunking под тип контента

```typescript
interface ChunkingStrategy {
  // Для кода: по функциям/классам
  code: SyntaxAwareChunker;
  
  // Для документации: по секциям (заголовки)
  docs: MarkdownSectionChunker;
  
  // Для конфигов: по блокам (YAML sections, JSON objects)
  config: StructuredChunker;
  
  // Для тестов: по test cases
  tests: TestCaseChunker;
}
```

**Оценка:** 12-16 часов

#### 2.3 Метаданные чанков

```typescript
interface EnhancedChunkMetadata {
  // Базовые
  kind: 'code' | 'docs' | 'config' | 'test';
  language: string;
  
  // Структурные
  functions?: string[]; // Имена функций в чанке
  classes?: string[];  // Имена классов
  exports?: string[];   // Экспорты
  imports?: string[];   // Импорты
  
  // Семантические
  topics?: string[];    // Темы (auth, database, api)
  tags?: string[];      // Теги
  
  // Временные
  lastModified?: string;
  gitCommit?: string;
  
  // Статистика
  complexity?: number;
  testCoverage?: number;
}
```

**Оценка:** 8-12 часов

---

### Фаза 3: Гибридный поиск (Высокий приоритет)

#### 3.1 Векторный + ключевые слова

```typescript
interface HybridSearchOptions {
  vectorWeight: number; // 0.7
  keywordWeight: number; // 0.3
  keywordFields: ('text' | 'functions' | 'exports' | 'path')[];
}

class HybridSearchEngine {
  async search(
    query: string,
    options: HybridSearchOptions
  ): Promise<SearchResult[]> {
    // 1. Векторный поиск
    const vectorResults = await this.vectorSearch(query);
    
    // 2. Поиск по ключевым словам (BM25 или TF-IDF)
    const keywordResults = await this.keywordSearch(query);
    
    // 3. Объединение с весами
    return this.mergeResults(vectorResults, keywordResults, options);
  }
}
```

**Преимущества:**
- Точные совпадения (ключевые слова) + семантика (векторы)
- Лучшая релевантность для технических запросов
- Компенсация недостатков каждого подхода

**Оценка:** 12-16 часов

#### 3.2 Query expansion

```typescript
class QueryExpander {
  async expand(query: string): Promise<string[]> {
    // 1. Синонимы из codebase (найти похожие термины)
    const synonyms = await this.findSynonyms(query);
    
    // 2. Расширение через LLM (опционально)
    const llmExpansion = await this.expandWithLLM(query);
    
    // 3. Добавление связанных терминов из индекса
    const related = await this.findRelatedTerms(query);
    
    return [query, ...synonyms, ...llmExpansion, ...related];
  }
}
```

**Пример:**
```
Запрос: "authentication"
Расширение: ["auth", "login", "credentials", "jwt", "session"]
```

**Оценка:** 8-12 часов

---

### Фаза 4: Ре-ранкинг и оптимизация контекста (Высокий приоритет)

#### 4.1 LLM-based ре-ранкинг

```typescript
interface RerankingOptions {
  model?: 'gpt-4' | 'claude' | 'local';
  topK: number; // Сколько кандидатов ре-ранжировать
  criteria: string[]; // Критерии релевантности
}

class Reranker {
  async rerank(
    query: string,
    candidates: KnowledgeChunk[],
    options: RerankingOptions
  ): Promise<KnowledgeChunk[]> {
    // Использование LLM для оценки релевантности
    // Cross-encoder подход
    
    const scores = await Promise.all(
      candidates.map(chunk => 
        this.scoreRelevance(query, chunk, options)
      )
    );
    
    return candidates
      .map((chunk, idx) => ({ chunk, score: scores[idx]! }))
      .sort((a, b) => b.score - a.score)
      .map(({ chunk }) => chunk);
  }
}
```

**Преимущества:**
- Более точная релевантность
- Учет контекста запроса
- Улучшение качества топ-K результатов

**Оценка:** 12-16 часов

#### 4.2 Дедупликация и диверсификация

```typescript
class ContextOptimizer {
  async optimize(
    chunks: KnowledgeChunk[],
    options: {
      maxChunks: number;
      diversityThreshold: number;
      deduplication: boolean;
    }
  ): Promise<KnowledgeChunk[]> {
    // 1. Дедупликация похожих чанков
    let deduplicated = options.deduplication
      ? this.deduplicate(chunks)
      : chunks;
    
    // 2. Диверсификация (разные файлы, разные темы)
    let diversified = this.diversify(deduplicated, options.diversityThreshold);
    
    // 3. Выбор топ-K с учетом разнообразия
    return this.selectTopK(diversified, options.maxChunks);
  }
  
  private deduplicate(chunks: KnowledgeChunk[]): KnowledgeChunk[] {
    // Удаление чанков с высокой семантической схожестью
    // Использование embedding similarity threshold
  }
  
  private diversify(
    chunks: KnowledgeChunk[],
    threshold: number
  ): KnowledgeChunk[] {
    // Обеспечение разнообразия:
    // - Разные файлы
    // - Разные темы
    // - Разные части кодовой базы
  }
}
```

**Оценка:** 8-12 часов

#### 4.3 Адаптивный выбор количества чанков

```typescript
class AdaptiveContextSelector {
  async selectChunks(
    query: string,
    candidates: KnowledgeChunk[],
    tokenBudget: number
  ): Promise<KnowledgeChunk[]> {
    // 1. Оценка токенов для каждого чанка
    const chunksWithTokens = candidates.map(chunk => ({
      chunk,
      tokens: estimateTokens(chunk.text),
    }));
    
    // 2. Жадный алгоритм: выбираем лучшие чанки в рамках бюджета
    const selected: KnowledgeChunk[] = [];
    let remainingTokens = tokenBudget;
    
    for (const { chunk, tokens } of chunksWithTokens.sort(
      (a, b) => b.chunk.score! - a.chunk.score!
    )) {
      if (remainingTokens >= tokens) {
        selected.push(chunk);
        remainingTokens -= tokens;
      }
    }
    
    return selected;
  }
}
```

**Оценка:** 4-6 часов

#### 4.4 Компрессия контекста (опционально)

```typescript
class ContextCompressor {
  async compress(
    chunks: KnowledgeChunk[],
    targetTokens: number
  ): Promise<string> {
    // Использование LLM для summarization
    // Извлечение только релевантной информации
    
    const summary = await this.summarize(chunks);
    return summary;
  }
}
```

**Оценка:** 8-12 часов (опционально)

---

### Фаза 5: Улучшенное хранилище и индексы (Средний приоритет)

#### 5.1 Переход на специализированное хранилище

**Варианты (см. детальное сравнение в `rag-vector-store-comparison.md`):**

1. **Qdrant** ⭐ **Рекомендуется для большинства случаев**
   - Баланс простоты и производительности
   - Легко запустить локально
   - Хорошая производительность векторного поиска
   - Нужно реализовать гибридный поиск самостоятельно

2. **Elasticsearch** ⭐ **Для production с аналитикой**
   - Гибридный поиск из коробки (векторный + BM25)
   - Мощная фильтрация и аналитика
   - Production-ready, масштабируемость
   - Высокая сложность развертывания
   - Требует много ресурсов

3. **ChromaDB** (легковесный, встроенный)
   - Максимальная простота
   - Хорошо для прототипов
   - Медленнее для production

4. **LanceDB** (быстрый, на Rust)
   - Хорошая производительность
   - Работает с файлами (Parquet)
   - Молодая экосистема

5. **SQLite + векторные расширения** (простой, переносимый)
   - Только для локальной разработки
   - Очень маленькие проекты

**Рекомендация:** Реализовать адаптерный паттерн для поддержки нескольких бэкендов

```typescript
// Адаптерный паттерн
interface VectorStoreAdapter {
  search(...): Promise<VectorSearchMatch[]>;
  index(...): Promise<void>;
}

// Qdrant (рекомендуется по умолчанию)
class QdrantAdapter implements VectorStoreAdapter {
  async search(scopeId: string, vector: EmbeddingVector, limit: number) {
    const results = await this.client.search(scopeId, {
      vector: vector.values,
      limit,
      score_threshold: 0.5,
    });
    // ...
  }
}

// Elasticsearch (для production с аналитикой)
class ElasticsearchAdapter implements VectorStoreAdapter {
  async search(scopeId: string, vector: EmbeddingVector, queryText: string, limit: number) {
    // Гибридный поиск из коробки!
    const response = await this.client.search({
      query: {
        hybrid: {
          queries: [
            { knn: { field: "embedding", query_vector: vector.values } },
            { match: { text: queryText } }
          ]
        }
      }
    });
    // ...
  }
}
```

**Конфигурация:**

```json
{
  "knowledge": {
    "engines": [{
      "options": {
        "vectorStore": {
          "type": "qdrant",  // или "elasticsearch", "chromadb"
          "options": {
            "url": "http://localhost:6333"
          }
        }
      }
    }]
  }
}
```

**Преимущества адаптерного подхода:**
- Легко переключаться между бэкендами
- Разработчики выбирают под свои нужды
- Постепенная миграция возможна
- Qdrant для локальной разработки, Elasticsearch для production

**Оценка:** 
- Qdrant: 16-24 часа
- Elasticsearch: 24-32 часа (сложнее из-за гибридного поиска)
- Адаптерный паттерн: +8 часов

#### 5.2 Инкрементальная индексация

```typescript
class IncrementalIndexer {
  async updateIndex(
    scopeId: string,
    changes: FileChange[]
  ): Promise<void> {
    // 1. Определить измененные файлы
    const modified = changes.filter(c => c.type === 'modified');
    const deleted = changes.filter(c => c.type === 'deleted');
    
    // 2. Удалить старые чанки для измененных файлов
    await this.removeChunks(scopeId, modified.map(c => c.path));
    
    // 3. Индексировать только измененные файлы
    for (const change of modified) {
      const chunks = await this.chunkFile(change.path);
      await this.addChunks(scopeId, chunks);
    }
    
    // 4. Удалить чанки удаленных файлов
    await this.removeChunks(scopeId, deleted.map(c => c.path));
  }
}
```

**Оценка:** 12-16 часов

---

### Фаза 6: Расширенные метаданные и фильтрация (Средний приоритет)

#### 6.1 Извлечение структуры кода

```typescript
class CodeStructureExtractor {
  async extract(file: string, content: string): Promise<CodeStructure> {
    const ast = parseAST(content);
    
    return {
      functions: extractFunctions(ast),
      classes: extractClasses(ast),
      interfaces: extractInterfaces(ast),
      types: extractTypes(ast),
      exports: extractExports(ast),
      imports: extractImports(ast),
      dependencies: extractDependencies(ast),
    };
  }
}
```

**Оценка:** 16-24 часа

#### 6.2 Автоматическое тегирование

```typescript
class AutoTagger {
  async tag(chunk: MindChunk): Promise<string[]> {
    const tags: string[] = [];
    
    // 1. Теги из структуры кода
    if (chunk.metadata.functions?.includes('authenticate')) {
      tags.push('auth');
    }
    
    // 2. Теги из импортов
    if (chunk.metadata.imports?.includes('express')) {
      tags.push('express', 'http');
    }
    
    // 3. Теги из паттернов (LLM-based опционально)
    const patternTags = await this.detectPatterns(chunk.text);
    tags.push(...patternTags);
    
    return tags;
  }
}
```

**Оценка:** 12-16 часов

#### 6.3 Расширенные фильтры

```typescript
interface AdvancedFilters {
  // Существующие
  sourceIds?: string[];
  paths?: string[];
  
  // Новые
  functions?: string[];      // Фильтр по функциям
  classes?: string[];        // Фильтр по классам
  tags?: string[];           // Фильтр по тегам
  languages?: string[];      // Фильтр по языкам
  minScore?: number;         // Минимальный score
  dateRange?: {              // Временной диапазон
    from?: string;
    to?: string;
  };
  complexity?: {             // Сложность кода
    min?: number;
    max?: number;
  };
}
```

**Оценка:** 8-12 часов

---

### Фаза 7: Оценка качества и метрики (Низкий приоритет)

#### 7.1 Метрики качества поиска

```typescript
interface SearchMetrics {
  // Релевантность
  precision: number;        // Доля релевантных результатов
  recall: number;           // Доля найденных релевантных
  f1Score: number;          // Гармоническое среднее
  
  // Производительность
  queryLatency: number;     // Время выполнения запроса
  indexSize: number;        // Размер индекса
  
  // Использование
  cacheHitRate: number;     // Процент попаданий в кэш
  avgResultsPerQuery: number;
}

class MetricsCollector {
  async evaluate(
    query: string,
    results: KnowledgeChunk[],
    groundTruth: string[] // Идеальные результаты
  ): Promise<SearchMetrics> {
    // Вычисление метрик
  }
}
```

**Оценка:** 8-12 часов

#### 7.2 A/B тестирование стратегий

```typescript
class SearchStrategyTester {
  async compare(
    query: string,
    strategies: SearchStrategy[]
  ): Promise<StrategyComparison> {
    // Запуск разных стратегий
    // Сравнение результатов
    // Выбор лучшей
  }
}
```

**Оценка:** 12-16 часов

---

## Приоритизация и план внедрения

### MVP (Минимально жизнеспособный продукт)

1. ✅ **Реальные embedding провайдеры** (OpenAI, local)
   - Время: 8-12 часов
   - Приоритет: Критично
   - Влияние: Высокое

2. ✅ **Синтаксически-осознанный chunking**
   - Время: 16-24 часа
   - Приоритет: Критично
   - Влияние: Высокое

3. ✅ **Гибридный поиск** (векторный + ключевые слова)
   - Время: 12-16 часов
   - Приоритет: Высокий
   - Влияние: Высокое

4. ✅ **Ре-ранкинг с LLM**
   - Время: 12-16 часов
   - Приоритет: Высокий
   - Влияние: Среднее-Высокое

**Итого MVP:** 48-68 часов

### Фаза 2 (Улучшения)

5. Дедупликация и диверсификация
6. Расширенные метаданные
7. Инкрементальная индексация
8. Query expansion

### Фаза 3 (Оптимизация)

9. Специализированное хранилище (Qdrant/ChromaDB)
10. Адаптивный выбор чанков
11. Метрики качества
12. Компрессия контекста (опционально)

---

## Конкретные шаги для начала

### Шаг 1: Добавить реальные embedding провайдеры

```typescript
// packages/mind-embeddings/src/providers/openai.ts
export function createOpenAIEmbeddingProvider(
  config: { apiKey: string; model?: string }
): EmbeddingProvider {
  const model = config.model ?? 'text-embedding-3-small';
  
  return {
    id: 'openai',
    async embed(texts: string[]) {
      const client = new OpenAI({ apiKey: config.apiKey });
      const response = await client.embeddings.create({
        model,
        input: texts,
      });
      return response.data.map(item => ({
        dim: item.embedding.length,
        values: item.embedding,
      }));
    },
  };
}
```

### Шаг 2: Улучшить chunking

```typescript
// packages/mind-engine/src/chunking/syntax-aware.ts
import * as ts from 'typescript';

export class SyntaxAwareChunker {
  chunkFile(file: string, content: string): MindChunk[] {
    const sourceFile = ts.createSourceFile(
      file,
      content,
      ts.ScriptTarget.Latest,
      true
    );
    
    const chunks: MindChunk[] = [];
    
    // Извлечение функций
    ts.forEachChild(sourceFile, node => {
      if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
        const text = content.substring(
          node.getFullStart(),
          node.getEnd()
        );
        chunks.push({
          chunkId: `${file}:${node.name?.getText()}`,
          text,
          // ... metadata
        });
      }
    });
    
    return chunks;
  }
}
```

### Шаг 3: Гибридный поиск

```typescript
// packages/mind-engine/src/search/hybrid.ts
import { BM25 } from 'bm25';

export class HybridSearchEngine {
  private bm25: BM25;
  
  async search(
    query: string,
    candidates: StoredMindChunk[]
  ): Promise<VectorSearchMatch[]> {
    // Векторный поиск
    const vectorResults = await this.vectorSearch(query, candidates);
    
    // Поиск по ключевым словам
    const keywordResults = this.bm25.search(query, candidates);
    
    // Объединение
    return this.merge(vectorResults, keywordResults, {
      vectorWeight: 0.7,
      keywordWeight: 0.3,
    });
  }
}
```

---

## Ожидаемые результаты

После внедрения улучшений:

1. **Релевантность результатов:** +40-60%
   - Реальные embedding модели дают лучшее семантическое понимание
   - Гибридный поиск находит точные совпадения + семантику
   - Ре-ранкинг улучшает топ-K результаты

2. **Качество контекста:** +50-70%
   - Синтаксически-осознанный chunking сохраняет логические единицы
   - Дедупликация убирает дубликаты
   - Адаптивный выбор оптимизирует под токен-бюджет

3. **Производительность:** +30-50%
   - Специализированное хранилище с индексами
   - Инкрементальная индексация вместо полного пересчета
   - Кэширование эмбеддингов

4. **Масштабируемость:** +100%+
   - Поддержка больших кодовых баз
   - Эффективное хранение и поиск
   - Оптимизация под production нагрузки

---

## Риски и митигации

### Риск 1: Стоимость API calls для embedding
**Митигация:**
- Агрессивное кэширование
- Локальные модели как fallback
- Batch processing для снижения количества запросов

### Риск 2: Сложность синтаксического анализа
**Митигация:**
- Начать с простых случаев (функции, классы)
- Fallback на line-based chunking
- Поддержка разных языков постепенно

### Риск 3: Производительность ре-ранкинга
**Митигация:**
- Ре-ранкинг только для топ-K кандидатов (например, топ-20)
- Опциональная фича (можно отключить)
- Кэширование результатов ре-ранкинга

---

## Заключение

Предложенные улучшения превратят Mind RAG из прототипа в production-ready систему, способную эффективно решать проблемы с контекстом и релевантностью для AI-инструментов разработки.

**Рекомендуемый порядок внедрения:**
1. Реальные embedding провайдеры (быстрый win)
2. Синтаксически-осознанный chunking (критично для качества)
3. Гибридный поиск (улучшение релевантности)
4. Ре-ранкинг (полировка результатов)

Остальные улучшения можно внедрять постепенно по мере необходимости.

