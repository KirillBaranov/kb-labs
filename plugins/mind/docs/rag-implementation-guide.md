# Руководство по реализации улучшений RAG

## Быстрый старт: Критичные улучшения

### 1. Реальные Embedding Провайдеры

#### Структура пакета

```
packages/mind-embeddings/src/
├── index.ts                    # Экспорт всех провайдеров
├── providers/
│   ├── deterministic.ts       # Существующий
│   ├── openai.ts              # Новый
│   ├── cohere.ts              # Новый
│   ├── local.ts               # Новый (Ollama)
│   └── factory.ts             # Фабрика провайдеров
├── cache/
│   └── embedding-cache.ts     # Кэширование
└── types.ts
```

#### Реализация OpenAI провайдера

```typescript
// packages/mind-embeddings/src/providers/openai.ts
import OpenAI from 'openai';
import type { EmbeddingVector } from '@kb-labs/knowledge-contracts';
import type { EmbeddingProvider } from '../types.js';

export interface OpenAIEmbeddingProviderOptions {
  apiKey: string;
  model?: 'text-embedding-3-small' | 'text-embedding-3-large' | 'text-embedding-ada-002';
  batchSize?: number;
  maxRetries?: number;
}

export function createOpenAIEmbeddingProvider(
  options: OpenAIEmbeddingProviderOptions
): EmbeddingProvider {
  const client = new OpenAI({ apiKey: options.apiKey });
  const model = options.model ?? 'text-embedding-3-small';
  const batchSize = options.batchSize ?? 100;
  
  return {
    id: 'openai',
    async embed(texts: string[]): Promise<EmbeddingVector[]> {
      const results: EmbeddingVector[] = [];
      
      // Batch processing для эффективности
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        
        try {
          const response = await client.embeddings.create({
            model,
            input: batch,
          });
          
          const vectors = response.data.map(item => ({
            dim: item.embedding.length,
            values: item.embedding,
          }));
          
          results.push(...vectors);
        } catch (error) {
          throw new Error(
            `OpenAI embedding failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }
      
      return results;
    },
  };
}
```

#### Фабрика провайдеров

```typescript
// packages/mind-embeddings/src/providers/factory.ts
import type { EmbeddingProvider } from '../types.js';
import { createDeterministicEmbeddingProvider } from './deterministic.js';
import { createOpenAIEmbeddingProvider } from './openai.js';

export interface EmbeddingProviderConfig {
  type: 'deterministic' | 'openai' | 'cohere' | 'local';
  options?: Record<string, unknown>;
}

export function createEmbeddingProvider(
  config: EmbeddingProviderConfig
): EmbeddingProvider {
  switch (config.type) {
    case 'deterministic':
      return createDeterministicEmbeddingProvider(
        config.options as { dimension?: number }
      );
    
    case 'openai':
      return createOpenAIEmbeddingProvider(
        config.options as { apiKey: string; model?: string }
      );
    
    case 'cohere':
      // TODO: Реализовать
      throw new Error('Cohere provider not implemented yet');
    
    case 'local':
      // TODO: Реализовать (Ollama)
      throw new Error('Local provider not implemented yet');
    
    default:
      throw new Error(`Unknown embedding provider type: ${config.type}`);
  }
}
```

#### Кэширование эмбеддингов

```typescript
// packages/mind-embeddings/src/cache/embedding-cache.ts
import { createHash } from 'node:crypto';
import fs from 'fs-extra';
import path from 'node:path';
import type { EmbeddingVector } from '@kb-labs/knowledge-contracts';

export interface EmbeddingCacheOptions {
  cacheDir: string;
  ttl?: number; // Time to live в секундах
}

export class EmbeddingCache {
  private readonly cacheDir: string;
  private readonly ttl: number;
  private readonly memoryCache = new Map<string, { vector: EmbeddingVector; timestamp: number }>();
  
  constructor(options: EmbeddingCacheOptions) {
    this.cacheDir = options.cacheDir;
    this.ttl = options.ttl ?? 86400 * 7; // 7 дней по умолчанию
    fs.ensureDirSync(this.cacheDir);
  }
  
  private getHash(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }
  
  private getCachePath(hash: string): string {
    return path.join(this.cacheDir, `${hash}.json`);
  }
  
  async get(text: string): Promise<EmbeddingVector | null> {
    const hash = this.getHash(text);
    
    // Проверка memory cache
    const cached = this.memoryCache.get(hash);
    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < this.ttl * 1000) {
        return cached.vector;
      }
      this.memoryCache.delete(hash);
    }
    
    // Проверка disk cache
    const cachePath = this.getCachePath(hash);
    if (await fs.pathExists(cachePath)) {
      const cached = await fs.readJson(cachePath) as {
        vector: EmbeddingVector;
        timestamp: number;
      };
      
      const age = Date.now() - cached.timestamp;
      if (age < this.ttl * 1000) {
        // Обновить memory cache
        this.memoryCache.set(hash, cached);
        return cached.vector;
      }
      
      // Удалить устаревший кэш
      await fs.remove(cachePath);
    }
    
    return null;
  }
  
  async set(text: string, vector: EmbeddingVector): Promise<void> {
    const hash = this.getHash(text);
    const timestamp = Date.now();
    
    const cached = { vector, timestamp };
    
    // Сохранить в memory cache
    this.memoryCache.set(hash, cached);
    
    // Сохранить в disk cache
    const cachePath = this.getCachePath(hash);
    await fs.writeJson(cachePath, cached, { spaces: 2 });
  }
  
  async invalidate(pattern: string): Promise<void> {
    // Удалить все файлы кэша, соответствующие паттерну
    // Можно реализовать более сложную логику
    const files = await fs.readdir(this.cacheDir);
    for (const file of files) {
      if (file.includes(pattern)) {
        await fs.remove(path.join(this.cacheDir, file));
      }
    }
  }
}
```

#### Интеграция в MindEngine

```typescript
// packages/mind-engine/src/index.ts (обновление)

import { EmbeddingCache } from '@kb-labs/mind-embeddings/cache';
import { createEmbeddingProvider } from '@kb-labs/mind-embeddings/providers/factory';

export class MindKnowledgeEngine implements KnowledgeEngine {
  private embeddingProvider: EmbeddingProvider;
  private embeddingCache?: EmbeddingCache;
  
  constructor(
    config: KnowledgeEngineConfig,
    context: KnowledgeEngineFactoryContext,
  ) {
    // ... существующий код ...
    
    const embeddingConfig = (config.options as MindEngineOptions)?.embedding;
    if (embeddingConfig) {
      this.embeddingProvider = createEmbeddingProvider({
        type: embeddingConfig.type ?? 'deterministic',
        options: embeddingConfig.options,
      });
      
      // Инициализировать кэш если нужен
      if (embeddingConfig.type !== 'deterministic') {
        this.embeddingCache = new EmbeddingCache({
          cacheDir: path.join(this.workspaceRoot, '.kb/mind/embeddings-cache'),
        });
      }
    }
  }
  
  private async embedChunks(chunks: MindChunk[]): Promise<EmbeddingVector[]> {
    const texts = chunks.map(chunk => chunk.text);
    const results: EmbeddingVector[] = [];
    
    // Попытка получить из кэша
    if (this.embeddingCache) {
      const cached: (EmbeddingVector | null)[] = await Promise.all(
        texts.map(text => this.embeddingCache!.get(text))
      );
      
      const uncached: { text: string; index: number }[] = [];
      for (let i = 0; i < texts.length; i++) {
        if (cached[i]) {
          results[i] = cached[i]!;
        } else {
          uncached.push({ text: texts[i]!, index: i });
        }
      }
      
      // Генерировать только для uncached
      if (uncached.length > 0) {
        const uncachedTexts = uncached.map(u => u.text);
        const newEmbeddings = await this.embeddingProvider.embed(uncachedTexts);
        
        // Сохранить в кэш и результаты
        for (let i = 0; i < uncached.length; i++) {
          const idx = uncached[i]!.index;
          const embedding = newEmbeddings[i]!;
          results[idx] = embedding;
          await this.embeddingCache.set(uncached[i]!.text, embedding);
        }
      }
      
      return results;
    }
    
    // Без кэша
    return this.embeddingProvider.embed(texts);
  }
}
```

---

### 2. Синтаксически-осознанный Chunking

#### Использование TypeScript Compiler API

```typescript
// packages/mind-engine/src/chunking/syntax-aware.ts
import * as ts from 'typescript';
import type { MindChunk, SpanRange } from '../types.js';

export interface SyntaxAwareChunkingOptions {
  minChunkSize: number;      // Минимальный размер чанка (в строках)
  maxChunkSize: number;      // Максимальный размер чанка
  preserveImports: boolean;  // Включать импорты в чанки
  groupRelated: boolean;     // Группировать связанные функции
}

export class SyntaxAwareChunker {
  private readonly options: Required<SyntaxAwareChunkingOptions>;
  
  constructor(options: Partial<SyntaxAwareChunkingOptions> = {}) {
    this.options = {
      minChunkSize: options.minChunkSize ?? 20,
      maxChunkSize: options.maxChunkSize ?? 200,
      preserveImports: options.preserveImports ?? true,
      groupRelated: options.groupRelated ?? true,
    };
  }
  
  chunkFile(
    sourceId: string,
    relativePath: string,
    content: string
  ): MindChunk[] {
    const sourceFile = ts.createSourceFile(
      relativePath,
      content,
      ts.ScriptTarget.Latest,
      true
    );
    
    const lines = content.split(/\r?\n/);
    const chunks: MindChunk[] = [];
    
    // Извлечение импортов (если нужно)
    const imports: ts.Statement[] = [];
    const otherNodes: ts.Node[] = [];
    
    ts.forEachChild(sourceFile, node => {
      if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node)) {
        imports.push(node as ts.Statement);
      } else {
        otherNodes.push(node);
      }
    });
    
    // Группировка функций и классов
    const units = this.extractSemanticUnits(sourceFile, otherNodes);
    
    // Создание чанков
    if (this.options.preserveImports && imports.length > 0) {
      const importText = imports
        .map(imp => content.substring(imp.getFullStart(), imp.getEnd()))
        .join('\n');
      
      chunks.push({
        chunkId: `${sourceId}:${relativePath}:imports`,
        sourceId,
        path: relativePath,
        span: this.getSpanForNode(imports[0]!, imports[imports.length - 1]!, lines),
        text: importText,
        metadata: {
          kind: 'imports',
          language: 'typescript',
        },
      });
    }
    
    // Создание чанков для семантических единиц
    for (const unit of units) {
      const unitText = content.substring(unit.start, unit.end);
      const unitLines = unitText.split(/\r?\n/);
      
      // Если единица слишком большая, разбить на под-чанки
      if (unitLines.length > this.options.maxChunkSize) {
        const subChunks = this.splitLargeUnit(
          sourceId,
          relativePath,
          unit,
          unitText,
          lines
        );
        chunks.push(...subChunks);
      } else {
        chunks.push({
          chunkId: `${sourceId}:${relativePath}:${unit.name}:${unit.startLine}-${unit.endLine}`,
          sourceId,
          path: relativePath,
          span: {
            startLine: unit.startLine,
            endLine: unit.endLine,
          },
          text: unitText,
          metadata: {
            kind: unit.kind,
            language: 'typescript',
            functions: unit.kind === 'function' ? [unit.name] : undefined,
            classes: unit.kind === 'class' ? [unit.name] : undefined,
          },
        });
      }
    }
    
    return chunks;
  }
  
  private extractSemanticUnits(
    sourceFile: ts.SourceFile,
    nodes: ts.Node[]
  ): SemanticUnit[] {
    const units: SemanticUnit[] = [];
    
    for (const node of nodes) {
      if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
        const name = node.name?.getText(sourceFile) ?? 'anonymous';
        units.push({
          name,
          kind: 'function',
          start: node.getFullStart(),
          end: node.getEnd(),
          startLine: ts.getLineAndCharacterOfPosition(sourceFile, node.getStart()).line + 1,
          endLine: ts.getLineAndCharacterOfPosition(sourceFile, node.getEnd()).line + 1,
        });
      } else if (ts.isClassDeclaration(node)) {
        const name = node.name?.getText(sourceFile) ?? 'anonymous';
        units.push({
          name,
          kind: 'class',
          start: node.getFullStart(),
          end: node.getEnd(),
          startLine: ts.getLineAndCharacterOfPosition(sourceFile, node.getStart()).line + 1,
          endLine: ts.getLineAndCharacterOfPosition(sourceFile, node.getEnd()).line + 1,
        });
      } else if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
        const name = node.name.getText(sourceFile);
        units.push({
          name,
          kind: 'type',
          start: node.getFullStart(),
          end: node.getEnd(),
          startLine: ts.getLineAndCharacterOfPosition(sourceFile, node.getStart()).line + 1,
          endLine: ts.getLineAndCharacterOfPosition(sourceFile, node.getEnd()).line + 1,
        });
      }
    }
    
    return units;
  }
  
  private splitLargeUnit(
    sourceId: string,
    relativePath: string,
    unit: SemanticUnit,
    text: string,
    lines: string[]
  ): MindChunk[] {
    // Разбить большую единицу на под-чанки
    // Например, большой класс разбить по методам
    const chunks: MindChunk[] = [];
    const unitLines = text.split(/\r?\n/);
    
    let start = 0;
    while (start < unitLines.length) {
      const end = Math.min(unitLines.length, start + this.options.maxChunkSize);
      const chunkText = unitLines.slice(start, end).join('\n');
      
      chunks.push({
        chunkId: `${sourceId}:${relativePath}:${unit.name}:${unit.startLine + start}-${unit.startLine + end}`,
        sourceId,
        path: relativePath,
        span: {
          startLine: unit.startLine + start,
          endLine: unit.startLine + end,
        },
        text: chunkText,
        metadata: {
          kind: unit.kind,
          language: 'typescript',
        },
      });
      
      start = end;
    }
    
    return chunks;
  }
  
  private getSpanForNode(
    startNode: ts.Node,
    endNode: ts.Node,
    lines: string[]
  ): SpanRange {
    // Вычисление span для группы узлов
    return {
      startLine: 1,
      endLine: lines.length,
    };
  }
}

interface SemanticUnit {
  name: string;
  kind: 'function' | 'class' | 'type' | 'interface';
  start: number;
  end: number;
  startLine: number;
  endLine: number;
}
```

#### Интеграция в MindEngine

```typescript
// packages/mind-engine/src/index.ts (обновление chunkFile)

import { SyntaxAwareChunker } from './chunking/syntax-aware.js';

export class MindKnowledgeEngine {
  private syntaxChunker?: SyntaxAwareChunker;
  
  private chunkFile(
    source: KnowledgeSource,
    relativePath: string,
    contents: string,
  ): MindChunk[] {
    // Использовать синтаксически-осознанный chunking для кода
    if (source.kind === 'code' && source.language === 'typescript') {
      if (!this.syntaxChunker) {
        this.syntaxChunker = new SyntaxAwareChunker({
          minChunkSize: 20,
          maxChunkSize: 200,
          preserveImports: true,
        });
      }
      
      return this.syntaxChunker.chunkFile(
        source.id,
        relativePath,
        contents
      );
    }
    
    // Fallback на line-based chunking для других типов
    return this.lineBasedChunk(source, relativePath, contents);
  }
  
  private lineBasedChunk(
    source: KnowledgeSource,
    relativePath: string,
    contents: string,
  ): MindChunk[] {
    // Существующая реализация
    // ...
  }
}
```

---

### 3. Гибридный поиск

#### Реализация BM25 для ключевых слов

```typescript
// packages/mind-engine/src/search/bm25.ts
export class BM25 {
  private k1 = 1.5;
  private b = 0.75;
  private documents: string[][] = [];
  private idf: Map<string, number> = new Map();
  private avgDocLength = 0;
  
  index(documents: string[]): void {
    this.documents = documents.map(doc => 
      this.tokenize(doc.toLowerCase())
    );
    
    // Вычисление IDF
    const docFreq: Map<string, number> = new Map();
    let totalLength = 0;
    
    for (const doc of this.documents) {
      totalLength += doc.length;
      const uniqueTerms = new Set(doc);
      for (const term of uniqueTerms) {
        docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
      }
    }
    
    this.avgDocLength = totalLength / this.documents.length;
    
    const numDocs = this.documents.length;
    for (const [term, freq] of docFreq) {
      this.idf.set(term, Math.log((numDocs - freq + 0.5) / (freq + 0.5) + 1));
    }
  }
  
  search(query: string, topK: number = 10): Array<{ index: number; score: number }> {
    const queryTerms = this.tokenize(query.toLowerCase());
    const scores: Array<{ index: number; score: number }> = [];
    
    for (let i = 0; i < this.documents.length; i++) {
      const doc = this.documents[i]!;
      let score = 0;
      
      for (const term of queryTerms) {
        const termFreq = doc.filter(t => t === term).length;
        if (termFreq === 0) continue;
        
        const idf = this.idf.get(term) ?? 0;
        const docLength = doc.length;
        
        const numerator = idf * termFreq * (this.k1 + 1);
        const denominator = termFreq + this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength));
        
        score += numerator / denominator;
      }
      
      scores.push({ index: i, score });
    }
    
    return scores
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
  
  private tokenize(text: string): string[] {
    // Простая токенизация (можно улучшить)
    return text
      .split(/\W+/)
      .filter(token => token.length > 2);
  }
}
```

#### Гибридный поиск

```typescript
// packages/mind-engine/src/search/hybrid.ts
import { BM25 } from './bm25.js';
import type { StoredMindChunk, VectorSearchMatch } from '../types.js';
import type { EmbeddingVector } from '@kb-labs/knowledge-contracts';

export interface HybridSearchOptions {
  vectorWeight: number;      // 0.7
  keywordWeight: number;     // 0.3
  topK: number;              // Сколько результатов вернуть
}

export class HybridSearchEngine {
  private bm25: BM25;
  
  constructor() {
    this.bm25 = new BM25();
  }
  
  async search(
    query: string,
    queryVector: EmbeddingVector,
    chunks: StoredMindChunk[],
    vectorScores: Map<string, number>, // Результаты векторного поиска
    options: HybridSearchOptions
  ): Promise<VectorSearchMatch[]> {
    // 1. Индексировать документы для BM25
    const documents = chunks.map(chunk => 
      this.extractSearchableText(chunk)
    );
    this.bm25.index(documents);
    
    // 2. Поиск по ключевым словам
    const keywordResults = this.bm25.search(query, options.topK * 2);
    
    // 3. Объединение результатов
    const combinedScores = new Map<string, number>();
    
    // Добавить векторные scores
    for (const [chunkId, score] of vectorScores) {
      combinedScores.set(chunkId, score * options.vectorWeight);
    }
    
    // Добавить keyword scores
    for (const result of keywordResults) {
      const chunk = chunks[result.index]!;
      const currentScore = combinedScores.get(chunk.chunkId) ?? 0;
      // Нормализовать keyword score к [0, 1]
      const normalizedKeywordScore = Math.min(result.score / 10, 1);
      combinedScores.set(
        chunk.chunkId,
        currentScore + normalizedKeywordScore * options.keywordWeight
      );
    }
    
    // 4. Сортировка и возврат топ-K
    const matches: VectorSearchMatch[] = Array.from(combinedScores.entries())
      .map(([chunkId, score]) => {
        const chunk = chunks.find(c => c.chunkId === chunkId)!;
        return { chunk, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, options.topK);
    
    return matches;
  }
  
  private extractSearchableText(chunk: StoredMindChunk): string {
    // Извлечь текст для поиска: сам текст + метаданные
    const parts: string[] = [chunk.text];
    
    if (chunk.metadata?.functions) {
      parts.push(...chunk.metadata.functions);
    }
    if (chunk.metadata?.classes) {
      parts.push(...chunk.metadata.classes);
    }
    if (chunk.path) {
      parts.push(chunk.path);
    }
    
    return parts.join(' ');
  }
}
```

#### Интеграция в query метод

```typescript
// packages/mind-engine/src/index.ts (обновление query)

import { HybridSearchEngine } from './search/hybrid.js';

export class MindKnowledgeEngine {
  private hybridSearch?: HybridSearchEngine;
  
  async query(
    query: KnowledgeQuery,
    context: KnowledgeExecutionContext,
  ) {
    const [queryVector] = await this.embeddingProvider.embed([query.text]);
    if (!queryVector) {
      throw createKnowledgeError(
        'KNOWLEDGE_QUERY_INVALID',
        'Unable to generate embedding for query text.',
      );
    }
    
    // 1. Векторный поиск
    const filters = this.createSearchFilters(context);
    const vectorMatches = await this.vectorStore.search(
      context.scope.id,
      queryVector,
      context.limit * 2, // Взять больше для гибридного поиска
      filters,
    );
    
    // 2. Гибридный поиск (если включен)
    const useHybrid = (this.options as any).hybridSearch ?? false;
    let finalMatches = vectorMatches;
    
    if (useHybrid && vectorMatches.length > 0) {
      if (!this.hybridSearch) {
        this.hybridSearch = new HybridSearchEngine();
      }
      
      // Загрузить все чанки scope для BM25
      const allChunks = await this.vectorStore.loadScope(context.scope.id);
      
      // Создать map векторных scores
      const vectorScores = new Map(
        vectorMatches.map(m => [m.chunk.chunkId, m.score])
      );
      
      // Гибридный поиск
      finalMatches = await this.hybridSearch.search(
        query.text,
        queryVector,
        allChunks,
        vectorScores,
        {
          vectorWeight: 0.7,
          keywordWeight: 0.3,
          topK: context.limit,
        }
      );
    }
    
    // 3. Формирование результата
    const chunks: KnowledgeChunk[] = finalMatches.map(match => ({
      id: match.chunk.chunkId,
      sourceId: match.chunk.sourceId,
      path: match.chunk.path,
      span: match.chunk.span,
      text: match.chunk.text,
      score: match.score,
      metadata: match.chunk.metadata,
    }));
    
    const contextText = chunks
      .map(chunk => formatChunkForContext(chunk))
      .join('\n\n---\n\n');
    
    return {
      query: { ...query, limit: context.limit },
      chunks,
      contextText,
      engineId: this.id,
      generatedAt: new Date().toISOString(),
    };
  }
}
```

---

## Конфигурация

### Обновленный kb.config.json

```json
{
  "knowledge": {
    "engines": [
      {
        "id": "mind-engine",
        "type": "mind",
        "options": {
          "indexDir": ".kb/mind/rag",
          "chunk": {
            "strategy": "syntax-aware",
            "codeLines": 200,
            "docLines": 80,
            "overlap": 20
          },
          "embedding": {
            "type": "openai",
            "options": {
              "apiKey": "${OPENAI_API_KEY}",
              "model": "text-embedding-3-small"
            }
          },
          "hybridSearch": true,
          "reranking": {
            "enabled": true,
            "topK": 20,
            "model": "gpt-4"
          }
        }
      }
    ]
  }
}
```

---

## Тестирование

### Unit тесты для синтаксического chunking

```typescript
// packages/mind-engine/src/__tests__/chunking/syntax-aware.spec.ts
import { describe, it, expect } from 'vitest';
import { SyntaxAwareChunker } from '../../chunking/syntax-aware.js';

describe('SyntaxAwareChunker', () => {
  it('should chunk TypeScript file by functions', () => {
    const code = `
import { Request, Response } from 'express';

export function authenticate(req: Request, res: Response) {
  // auth logic
}

export class UserService {
  async getUser(id: string) {
    // get user
  }
}
`;
    
    const chunker = new SyntaxAwareChunker();
    const chunks = chunker.chunkFile('test', 'test.ts', code);
    
    expect(chunks).toHaveLength(3); // imports + function + class
    expect(chunks[0]!.metadata.kind).toBe('imports');
    expect(chunks[1]!.metadata.functions).toContain('authenticate');
    expect(chunks[2]!.metadata.classes).toContain('UserService');
  });
});
```

---

## Следующие шаги

1. ✅ Реализовать OpenAI embedding провайдер
2. ✅ Добавить кэширование эмбеддингов
3. ✅ Реализовать синтаксически-осознанный chunking
4. ✅ Добавить гибридный поиск
5. ⏭️ Реализовать ре-ранкинг с LLM
6. ⏭️ Добавить дедупликацию и диверсификацию





