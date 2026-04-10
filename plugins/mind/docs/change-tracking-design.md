# Change Tracking Integration in Mind v2

**Цель:** Интегрировать отслеживание изменений в Mind v2 для упрощения поиска багов через semantic search по недавно измененному коду.

## Проблема

Когда появляется баг, сложно найти где именно он был введен:
- Нет визуальной индикации недавних изменений в результатах поиска
- Приходится шерстить весь код вручную
- Нет связи между semantic search и Git изменениями

## Решение: Change Tracking в Mind v2

### Ключевая идея

**Не дублировать Git, а дополнять его через semantic search:**
- Git показывает ЧТО изменилось (diff, blame)
- Mind v2 показывает ГДЕ искать через semantic search по недавно измененному коду
- Комбинация: "найди баги в недавно измененном коде, связанном с compression"

### Архитектура

```
┌─────────────────────────────────────────────────────────┐
│              Indexing Phase                             │
├─────────────────────────────────────────────────────────┤
│  1. Collect files (existing)                            │
│  2. Get Git metadata (NEW)                              │
│     - Last modified date                                │
│     - Author                                            │
│     - Commit hash                                       │
│     - Lines changed (added/deleted)                     │
│  3. Store in chunk metadata                             │
└─────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│              Storage (Qdrant Payload)                   │
├─────────────────────────────────────────────────────────┤
│  chunk.metadata = {                                     │
│    ...existing metadata,                                 │
│    changeTracking: {                                    │
│      lastModified: timestamp,                           │
│      lastModifiedDaysAgo: number,                       │
│      author: string,                                    │
│      commitHash: string,                                │
│      linesChanged: { added: N, deleted: M },            │
│      changeType: 'added' | 'modified' | 'deleted'       │
│    }                                                    │
│  }                                                      │
└─────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│              Query Phase                                │
├─────────────────────────────────────────────────────────┤
│  1. Semantic search (existing)                          │
│  2. Filter by change tracking (NEW)                     │
│     - "recent changes" → filter by lastModifiedDaysAgo  │
│     - "changes by author" → filter by author            │
│  3. Boost recent changes (NEW)                          │
│     - Recent changes get higher score                   │
│  4. Show change info in results (NEW)                  │
└─────────────────────────────────────────────────────────┘
```

## Детальный дизайн

### 1. Расширение FileMetadata

```typescript
export interface FileMetadata {
  path: string;
  mtime: number;
  hash?: string;
  
  // NEW: Git change tracking
  changeTracking?: {
    lastModified: number;        // Timestamp of last commit
    lastModifiedDaysAgo: number; // Calculated for easy filtering
    author: string;              // Git author
    commitHash: string;          // Last commit hash
    commitMessage?: string;       // Last commit message (optional)
    linesChanged: {
      added: number;
      deleted: number;
      total: number;
    };
    changeType: 'added' | 'modified' | 'deleted';
    // For incremental: was this file changed since last index?
    isChanged: boolean;
  };
}
```

### 2. Git Integration Module

```typescript
// src/change-tracking/git-tracker.ts

export interface GitChangeInfo {
  lastModified: number;
  author: string;
  commitHash: string;
  commitMessage?: string;
  linesChanged: { added: number; deleted: number };
  changeType: 'added' | 'modified' | 'deleted';
}

export class GitChangeTracker {
  constructor(
    private workspaceRoot: string,
    private runtime: RuntimeAdapter,
  ) {}
  
  /**
   * Get change tracking info for a file
   * Uses git log to get last commit info
   */
  async getChangeInfo(filePath: string): Promise<GitChangeInfo | null> {
    // Check if file is tracked by Git
    if (!await this.isTracked(filePath)) {
      return null;
    }
    
    // Get last commit info
    const lastCommit = await this.getLastCommit(filePath);
    if (!lastCommit) {
      return null;
    }
    
    // Get lines changed
    const linesChanged = await this.getLinesChanged(filePath, lastCommit.hash);
    
    return {
      lastModified: lastCommit.timestamp,
      author: lastCommit.author,
      commitHash: lastCommit.hash,
      commitMessage: lastCommit.message,
      linesChanged,
      changeType: await this.getChangeType(filePath, lastCommit.hash),
    };
  }
  
  /**
   * Get change info for multiple files (batch)
   */
  async getChangeInfoBatch(filePaths: string[]): Promise<Map<string, GitChangeInfo>> {
    // Optimize: use single git command for batch
    const results = new Map<string, GitChangeInfo>();
    
    // Use git log --all --format=... for efficiency
    for (const path of filePaths) {
      const info = await this.getChangeInfo(path);
      if (info) {
        results.set(path, info);
      }
    }
    
    return results;
  }
  
  private async isTracked(filePath: string): Promise<boolean> {
    // git ls-files --error-unmatch <file>
  }
  
  private async getLastCommit(filePath: string): Promise<CommitInfo | null> {
    // git log -1 --format="%H|%an|%at|%s" -- <file>
  }
  
  private async getLinesChanged(filePath: string, commitHash: string): Promise<{ added: number; deleted: number }> {
    // git show --stat <commit> -- <file>
  }
  
  private async getChangeType(filePath: string, commitHash: string): Promise<'added' | 'modified' | 'deleted'> {
    // Check if file was added/modified/deleted in commit
  }
}
```

### 3. Интеграция в collectChunks

```typescript
// В MindKnowledgeEngine.collectChunks()

private async collectChunks(
  sources: KnowledgeSource[],
): Promise<{ chunks: MindChunk[]; fileMetadata: Map<string, FileMetadata> }> {
  // ... existing code ...
  
  const fileMetadata = new Map<string, FileMetadata>();
  
  // NEW: Initialize Git tracker if enabled
  let gitTracker: GitChangeTracker | null = null;
  if (this.options.changeTracking?.enabled) {
    gitTracker = new GitChangeTracker(this.workspaceRoot, this.runtime);
  }
  
  for (const source of sources) {
    const files = await fg(source.paths, { ... });
    
    for (const file of files) {
      // ... existing file reading ...
      
      const stats = await fs.stat(fullPath);
      const hash = createHash('sha256').update(contents).digest('hex');
      
      const metadata: FileMetadata = {
        path: normalizedPath,
        mtime: stats.mtimeMs,
        hash,
      };
      
      // NEW: Get Git change tracking info
      if (gitTracker) {
        const changeInfo = await gitTracker.getChangeInfo(normalizedPath);
        if (changeInfo) {
          metadata.changeTracking = {
            ...changeInfo,
            lastModifiedDaysAgo: Math.floor(
              (Date.now() - changeInfo.lastModified) / (24 * 60 * 60 * 1000)
            ),
            isChanged: true, // Will be compared during incremental update
          };
        }
      }
      
      fileMetadata.set(normalizedPath, metadata);
      
      // ... rest of existing code ...
    }
  }
  
  return { chunks: chunkList, fileMetadata };
}
```

### 4. Расширение chunk metadata

```typescript
// При создании StoredMindChunk

const storedChunks: StoredMindChunk[] = chunks.map((chunk, idx) => {
  const fileMeta = fileMetadataByPath.get(chunk.path);
  
  return {
    chunkId: chunk.chunkId,
    scopeId: options.scope.id,
    sourceId: chunk.sourceId,
    path: chunk.path,
    span: chunk.span,
    text: chunk.text,
    metadata: {
      ...chunk.metadata,
      fileHash: fileMeta?.hash,
      fileMtime: fileMeta?.mtime,
      
      // NEW: Include change tracking in chunk metadata
      changeTracking: fileMeta?.changeTracking ? {
        lastModified: fileMeta.changeTracking.lastModified,
        lastModifiedDaysAgo: fileMeta.changeTracking.lastModifiedDaysAgo,
        author: fileMeta.changeTracking.author,
        commitHash: fileMeta.changeTracking.commitHash,
        linesChanged: fileMeta.changeTracking.linesChanged,
        changeType: fileMeta.changeTracking.changeType,
      } : undefined,
    },
    embedding: embeddings[idx]!,
  };
});
```

### 5. Фильтрация и бустинг в query

```typescript
// В MindKnowledgeEngine.query()

async query(query: KnowledgeQuery, context: KnowledgeExecutionContext) {
  // ... existing search ...
  
  // NEW: Apply change tracking filters
  const filters = this.createSearchFilters(context);
  
  if (this.options.changeTracking?.enabled) {
    // Filter by "recent changes" if query suggests it
    if (this.isRecentChangesQuery(query.text)) {
      filters.changeTracking = {
        maxDaysAgo: 7, // Last 7 days
      };
    }
    
    // Filter by author if specified
    if (context.changeTracking?.author) {
      filters.changeTracking = {
        ...filters.changeTracking,
        author: context.changeTracking.author,
      };
    }
  }
  
  // ... perform search ...
  
  // NEW: Boost recent changes
  if (this.options.changeTracking?.enabled && this.options.changeTracking.boostRecent) {
    matches = matches.map(match => {
      const changeTracking = match.chunk.metadata?.changeTracking;
      if (changeTracking && changeTracking.lastModifiedDaysAgo <= 7) {
        // Boost: 1.2x for changes in last 7 days
        const boost = 1.0 + (0.2 * (1 - changeTracking.lastModifiedDaysAgo / 7));
        return {
          ...match,
          score: match.score * boost,
        };
      }
      return match;
    });
    
    // Re-sort after boost
    matches.sort((a, b) => b.score - a.score);
  }
  
  // ... rest of query ...
}

private isRecentChangesQuery(queryText: string): boolean {
  const recentKeywords = ['recent', 'latest', 'new', 'changed', 'modified', 'updated'];
  const lowerQuery = queryText.toLowerCase();
  return recentKeywords.some(keyword => lowerQuery.includes(keyword));
}
```

### 6. Расширение VectorSearchFilters

```typescript
export interface VectorSearchFilters {
  sourceIds?: Set<string>;
  pathMatcher?: (filePath: string) => boolean;
  
  // NEW: Change tracking filters
  changeTracking?: {
    maxDaysAgo?: number;      // Only chunks changed in last N days
    minDaysAgo?: number;     // Only chunks changed at least N days ago
    author?: string;          // Only chunks changed by specific author
    changeType?: ('added' | 'modified' | 'deleted')[]; // Filter by change type
  };
}
```

### 7. Отображение в результатах

```typescript
// В formatChunkForContext()

function formatChunkForContext(
  chunk: KnowledgeChunk,
  compressionOptions?: CompressionOptions,
  score?: number,
): string {
  const parts: string[] = [];
  
  // ... existing formatting ...
  
  // NEW: Add change tracking info
  if (chunk.metadata?.changeTracking) {
    const ct = chunk.metadata.changeTracking;
    const changeInfo: string[] = [];
    
    if (ct.lastModifiedDaysAgo <= 7) {
      changeInfo.push(`🆕 Changed ${ct.lastModifiedDaysAgo} day${ct.lastModifiedDaysAgo !== 1 ? 's' : ''} ago`);
    }
    
    if (ct.author) {
      changeInfo.push(`by ${ct.author}`);
    }
    
    if (ct.linesChanged.total > 0) {
      changeInfo.push(`(${ct.linesChanged.added}+${ct.linesChanged.deleted}-)`);
    }
    
    if (changeInfo.length > 0) {
      parts.push(`Change: ${changeInfo.join(' ')}`);
    }
  }
  
  // ... rest of formatting ...
}
```

## Конфигурация

```json
{
  "knowledge": {
    "engines": [{
      "options": {
        "changeTracking": {
          "enabled": true,
          "boostRecent": true,
          "recentDaysThreshold": 7,
          "includeCommitMessage": false,
          "gitCommand": "git"  // Path to git executable
        }
      }
    }]
  }
}
```

## Use Cases

### 1. Поиск багов в недавно измененном коде

```bash
# Query: "find bugs in recent compression changes"
pnpm kb mind:rag-query --text "compression bugs errors" --intent search

# Results будут показывать:
# - Chunks с compression кодом
# - С пометкой "🆕 Changed 2 days ago by kirill"
# - Недавно измененные chunks получают boost
```

### 2. Поиск изменений конкретного автора

```bash
# Query: "recent changes by author"
pnpm kb mind:rag-query --text "plugin system" --intent search --author "kirill"

# Results фильтруются по автору
```

### 3. Поиск только новых файлов

```bash
# Query: "new files added"
# Фильтр: changeType = 'added'
```

## Преимущества

1. **Semantic Search + Git**: Комбинация semantic search с Git метаданными
2. **Не дублирует Git**: Использует Git как источник данных, не заменяет его
3. **Естественная интеграция**: Использует существующую инфраструктуру (Qdrant payload)
4. **Гибкость**: Можно включать/выключать, настраивать boost
5. **Производительность**: Git команды выполняются только при индексации

## Потенциальные проблемы и решения

### Проблема 1: Git не доступен
**Решение:** Graceful degradation - если Git не доступен, просто не собираем change tracking

### Проблема 2: Медленные Git команды
**Решение:** 
- Batch операции (один git log для всех файлов)
- Кэширование результатов
- Опциональная feature (можно отключить)

### Проблема 3: Большие репозитории
**Решение:**
- Инкрементальное обновление (только измененные файлы)
- Параллельная обработка
- Оптимизация Git команд

### Проблема 4: Не все файлы в Git
**Решение:**
- Проверка `git ls-files` перед запросом
- Fallback на file mtime если не в Git

## Альтернативы (отклонены)

### 1. Отдельная коллекция в Qdrant для изменений
**Почему нет:** Дублирование данных, сложнее синхронизация

### 2. Внешний сервис для отслеживания изменений
**Почему нет:** Дополнительная зависимость, сложность

### 3. Git hooks для автоматического обновления
**Почему нет:** Может замедлить Git операции, требует настройки

## Реализация

### Этап 1: Базовая интеграция
1. GitChangeTracker модуль
2. Расширение FileMetadata
3. Интеграция в collectChunks
4. Сохранение в chunk metadata

### Этап 2: Фильтрация и поиск
1. Расширение VectorSearchFilters
2. Фильтрация в query
3. Boost для недавних изменений

### Этап 3: UI и отображение
1. Отображение change info в результатах
2. CLI флаги для фильтрации
3. Документация

## Метрики успеха

- ✅ Можно найти баги через semantic search по недавно измененному коду
- ✅ Не замедляет индексацию более чем на 10%
- ✅ Не требует дополнительной инфраструктуры
- ✅ Работает даже если Git не доступен (graceful degradation)

