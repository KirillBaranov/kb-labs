# Спецификация конфигурации RAG системы для Mind

**Дата:** 2025-01-XX  
**Версия:** 1.0  
**Статус:** Спецификация

---

## Структура конфигурации в kb.config.json

Конфигурация RAG системы находится в секции `knowledge.engines[].options` для каждого engine типа `mind`.

### Полная структура конфигурации

```json
{
  "knowledge": {
    "sources": [
      {
        "id": "frontend-code",
        "kind": "code",
        "language": "typescript",
        "paths": ["src/**/*.ts", "src/**/*.tsx"],
        "exclude": ["**/*.test.ts", "**/*.spec.ts"]
      },
      {
        "id": "docs",
        "kind": "docs",
        "paths": ["docs/**/*.md", "README.md"]
      }
    ],
    "scopes": [
      {
        "id": "frontend",
        "label": "Frontend Codebase",
        "sources": ["frontend-code", "docs"],
        "defaultEngine": "mind-default"
      }
    ],
    "engines": [
      {
        "id": "mind-default",
        "type": "mind",
        "options": {
          // === EMBEDDING CONFIGURATION ===
          "embedding": {
            "type": "auto",  // "auto" | "openai" | "local" | "deterministic"
            "provider": {
              "openai": {
                "apiKey": "${OPENAI_API_KEY}",  // или прямое значение
                "model": "text-embedding-3-small",  // "text-embedding-3-small" | "text-embedding-3-large" | "text-embedding-ada-002"
                "dimension": 1536,  // опционально, для small: 1536, для large: 3072
                "batchSize": 100,  // размер батча (1-2048)
                "timeout": 30000,  // timeout в мс
                "retries": 3  // количество повторов при ошибке
              },
              "local": {
                "type": "ollama",  // "ollama" | "in-process"
                "model": "nomic-embed",  // "nomic-embed" | "all-minilm" | другие
                "endpoint": "http://localhost:11434",  // для Ollama
                "dimension": 768  // размерность модели
              },
              "deterministic": {
                "dimension": 1536  // для тестирования
              }
            },
            "cache": {
              "enabled": true,
              "ttl": 604800,  // TTL в секундах (7 дней)
              "maxSize": 100000  // максимальное количество кэшированных embeddings
            }
          },
          
          // === VECTOR STORE CONFIGURATION ===
          "vectorStore": {
            "type": "auto",  // "auto" | "local" | "qdrant"
            "local": {
              "indexDir": ".kb/mind/rag"  // путь к индексу (относительно workspace root)
            },
            "qdrant": {
              "url": "${QDRANT_URL:-http://localhost:6333}",  // URL Qdrant сервера
              "apiKey": "${QDRANT_API_KEY}",  // опционально, для Qdrant Cloud
              "collectionName": "mind_chunks",  // имя коллекции (по умолчанию: mind_chunks)
              "dimension": 1536,  // размерность векторов (должна совпадать с embedding)
              "timeout": 30000  // timeout в мс
            }
          },
          
          // === CHUNKING CONFIGURATION ===
          "chunk": {
            "codeLines": 120,  // максимум строк для code chunks
            "docLines": 80,  // максимум строк для doc chunks
            "overlap": 20  // перекрытие между чанками (для line-based fallback)
          },
          // Примечание: AST и structure chunking автоматически выбираются на основе типа файла
          // TypeScript/JavaScript → AST chunking
          // Markdown → Structure chunking
          // Остальные → Line-based chunking
          
          // === SEARCH CONFIGURATION ===
          "search": {
            "hybrid": true,  // включить hybrid search (vector + keyword)
            "vectorWeight": 0.7,  // вес векторного поиска (0-1)
            "keywordWeight": 0.3,  // вес keyword поиска (0-1)
            "rrfK": 60,  // параметр RRF (Reciprocal Rank Fusion)
            
            // === RE-RANKING CONFIGURATION ===
            "reranking": {
              "type": "cross-encoder",  // "cross-encoder" | "heuristic" | "none"
              "crossEncoder": {
                "endpoint": "https://api.openai.com/v1/chat/completions",  // опционально
                "apiKey": "${OPENAI_API_KEY}",  // опционально, берется из env если не указан
                "model": "gpt-4o-mini",  // модель для re-ranking
                "batchSize": 10,  // размер батча для re-ranking запросов
                "timeout": 30000  // timeout в мс
              },
              "topK": 20,  // количество кандидатов для re-ranking
              "minScore": 0  // минимальный score для включения после re-ranking
            },
            
            // === CONTEXT OPTIMIZATION ===
            "optimization": {
              "deduplication": true,  // включить дедупликацию
              "deduplicationThreshold": 0.9,  // порог схожести для дедупликации (0-1)
              "diversification": true,  // включить диверсификацию
              "diversityThreshold": 0.3,  // порог разнообразия (0-1)
              "maxChunksPerFile": 3,  // максимум chunks из одного файла
              "adaptiveSelection": false,  // адаптивный выбор на основе token budget
              "avgTokensPerChunk": 200  // среднее количество токенов на chunk (для оценки)
            }
          },
          
          // === INDEX DIRECTORY ===
          "indexDir": ".kb/mind/rag"  // путь к директории индексов (относительно workspace root)
        },
        "llmEngineId": "openai-gpt4"  // опционально, для будущих LLM операций
      }
    ],
    "defaults": {
      "maxChunks": 10,
      "fallbackScopeId": "frontend",
      "fallbackEngineId": "mind-default"
    }
  }
}
```

---

## Упрощенные конфигурации

### Минимальная конфигурация (автоматический выбор)

```json
{
  "knowledge": {
    "sources": [...],
    "scopes": [...],
    "engines": [
      {
        "id": "mind-default",
        "type": "mind",
        "options": {
          "embedding": {
            "type": "auto"  // автоматический выбор на основе доступности
          },
          "vectorStore": {
            "type": "auto"  // автоматический выбор (local если Qdrant недоступен)
          }
        }
      }
    ]
  }
}
```

### Конфигурация только с OpenAI

```json
{
  "knowledge": {
    "engines": [
      {
        "id": "mind-openai",
        "type": "mind",
        "options": {
          "embedding": {
            "type": "openai",
            "provider": {
              "openai": {
                "model": "text-embedding-3-small"
              }
            }
          },
          "vectorStore": {
            "type": "local"
          }
        }
      }
    ]
  }
}
```

### Конфигурация с Qdrant Cloud

```json
{
  "knowledge": {
    "engines": [
      {
        "id": "mind-production",
        "type": "mind",
        "options": {
          "embedding": {
            "type": "openai",
            "provider": {
              "openai": {
                "model": "text-embedding-3-large",
                "dimension": 3072
              }
            }
          },
          "vectorStore": {
            "type": "qdrant",
            "provider": {
              "qdrant": {
                "url": "https://your-cluster.qdrant.io",
                "apiKey": "${QDRANT_API_KEY}",
                "vectorSize": 3072
              }
            }
          },
          "search": {
            "type": "hybrid"
          },
          "reranking": {
            "enabled": true
          }
        }
      }
    ]
  }
}
```

### Локальная конфигурация (offline)

```json
{
  "knowledge": {
    "engines": [
      {
        "id": "mind-local",
        "type": "mind",
        "options": {
          "embedding": {
            "type": "local",
            "provider": {
              "local": {
                "type": "ollama",
                "model": "nomic-embed",
                "endpoint": "http://localhost:11434"
              }
            }
          },
          "vectorStore": {
            "type": "local"
          }
        }
      }
    ]
  }
}
```

---

## Переменные окружения

Конфигурация может использовать переменные окружения через синтаксис `${VAR_NAME}` или `${VAR_NAME:-default}`:

### Основные переменные

- `OPENAI_API_KEY` - API ключ OpenAI (обязательно для OpenAI provider)
- `QDRANT_URL` - URL Qdrant сервера (по умолчанию: `http://localhost:6333`)
- `QDRANT_API_KEY` - API ключ Qdrant (для Qdrant Cloud)

### Переменные для переопределения

- `EMBEDDING_PROVIDER` - принудительный выбор провайдера (`"openai" | "local" | "deterministic"`)
- `VECTOR_STORE_TYPE` - принудительный выбор хранилища (`"local" | "qdrant"`)
- `MIND_RAG_CACHE_TTL` - TTL кэша в секундах (по умолчанию: 604800)
- `MIND_RAG_BATCH_SIZE` - размер батча для embedding (по умолчанию: 100)

### Пример использования

```json
{
  "knowledge": {
    "engines": [
      {
        "id": "mind-default",
        "type": "mind",
        "options": {
          "embedding": {
            "type": "${EMBEDDING_PROVIDER:-auto}",
            "provider": {
              "openai": {
                "apiKey": "${OPENAI_API_KEY}"
              }
            }
          },
          "vectorStore": {
            "type": "${VECTOR_STORE_TYPE:-auto}",
            "provider": {
              "qdrant": {
                "url": "${QDRANT_URL:-http://localhost:6333}",
                "apiKey": "${QDRANT_API_KEY}"
              }
            }
          }
        }
      }
    ]
  }
}
```

---

## Значения по умолчанию

Если опции не указаны, используются следующие значения по умолчанию:

### Embedding
- `type`: `"auto"` (автоматический выбор)
- `model`: `"text-embedding-3-small"` (для OpenAI)
- `batchSize`: `100`
- `timeout`: `30000` (30 секунд)
- `retries`: `3`
- `cache.enabled`: `true`
- `cache.ttl`: `604800` (7 дней)
- `cache.maxSize`: `100000`

### Vector Store
- `type`: `"auto"` (автоматический выбор)
- `indexDir`: `".kb/mind/rag"` (для local)
- `url`: `"http://localhost:6333"` (для Qdrant)
- `collectionPrefix`: `"mind"`
- `timeout`: `30000`
- `retries`: `3`
- `createCollection`: `true`
- `distance`: `"Cosine"`

### Chunking
- `strategy`: `"ast"` (для кода)
- `code.method`: `"ast"`
- `code.maxLines`: `200`
- `code.minLines`: `20`
- `code.overlap`: `20`
- `code.preserveContext`: `true`
- `code.includeJSDoc`: `true`
- `docs.method`: `"structure"`
- `docs.byHeadings`: `true`
- `docs.maxLines`: `150`
- `docs.minLines`: `30`
- `docs.overlap`: `20`
- `docs.includeCodeBlocks`: `true`

### Search
- `type`: `"hybrid"`
- `vector.topK`: `50`
- `vector.minScore`: `0.5`
- `keyword.enabled`: `true`
- `keyword.algorithm`: `"bm25"`
- `keyword.topK`: `30`
- `keyword.minScore`: `0.3`
- `hybrid.enabled`: `true`
- `hybrid.fusion`: `"rrf"`
- `hybrid.rrf.k`: `60`
- `hybrid.weights.vector`: `0.7`
- `hybrid.weights.keyword`: `0.3`
- `hybrid.topK`: `20`

### Re-ranking
- `enabled`: `true`
- `provider`: `"openai"`
- `topK`: `20`
- `finalTopK`: `10`
- `timeout`: `10000`
- `fallbackOnError`: `true`

### Optimization
- `deduplication.enabled`: `true`
- `deduplication.method`: `"semantic"`
- `deduplication.semanticThreshold`: `0.95`
- `deduplication.exactHash`: `true`
- `diversification.enabled`: `true`
- `diversification.method`: `"mmr"`
- `diversification.lambda`: `0.5`
- `diversification.minDistance`: `0.3`
- `adaptive.enabled`: `true`
- `adaptive.tokenBudget`: `5000`
- `adaptive.priority`: `"score"`
- `adaptive.truncateChunks`: `true`

### Indexing
- `incremental`: `true`
- `batchSize`: `100`
- `parallel`: `true`
- `maxConcurrency`: `5`
- `saveProgress`: `true`

### Performance
- `cacheEmbeddings`: `true`
- `cacheSearchResults`: `true`
- `searchCacheTTL`: `3600` (1 час)
- `warmup`: `false`

---

## Валидация конфигурации

### Проверки совместимости

1. **Vector size совместимость:**
   - `vectorStore.provider.qdrant.vectorSize` должен совпадать с `embedding.provider.openai.dimension`
   - Если не указано, автоматически берется из embedding model

2. **Provider доступность:**
   - При `embedding.type: "openai"` требуется `OPENAI_API_KEY`
   - При `vectorStore.type: "qdrant"` проверяется доступность Qdrant сервера

3. **Model совместимость:**
   - `text-embedding-3-small` → dimension: 1536
   - `text-embedding-3-large` → dimension: 3072
   - `text-embedding-ada-002` → dimension: 1536

### Автоматические исправления

- Если `vectorSize` не указан, берется из embedding model
- Если `dimension` не указан, берется из модели по умолчанию
- Если `type: "auto"`, выбирается лучший доступный вариант

### Предупреждения

- Использование `deterministic` embedding в production
- Низкий `tokenBudget` (< 2000 токенов)
- Высокий `semanticThreshold` (> 0.98) может исключить релевантные результаты
- Отключенный кэш может привести к высоким затратам

---

## Примеры использования

### Разработка (локально, быстро)

```json
{
  "knowledge": {
    "engines": [
      {
        "id": "mind-dev",
        "type": "mind",
        "options": {
          "embedding": { "type": "local" },
          "vectorStore": { "type": "local" },
          "search": { "type": "vector" },
          "reranking": { "enabled": false },
          "optimization": {
            "deduplication": { "enabled": true },
            "diversification": { "enabled": false },
            "adaptive": { "tokenBudget": 3000 }
          }
        }
      }
    ]
  }
}
```

### Production (максимальное качество)

```json
{
  "knowledge": {
    "engines": [
      {
        "id": "mind-prod",
        "type": "mind",
        "options": {
          "embedding": {
            "type": "openai",
            "provider": {
              "openai": {
                "model": "text-embedding-3-large",
                "dimension": 3072
              }
            }
          },
          "vectorStore": {
            "type": "qdrant",
            "provider": {
              "qdrant": {
                "url": "${QDRANT_URL}",
                "vectorSize": 3072
              }
            }
          },
          "chunking": {
            "strategy": "ast",
            "code": { "method": "ast", "preserveContext": true }
          },
          "search": {
            "type": "hybrid",
            "hybrid": {
              "fusion": "rrf",
              "topK": 30
            }
          },
          "reranking": {
            "enabled": true,
            "topK": 30,
            "finalTopK": 10
          },
          "optimization": {
            "deduplication": { "enabled": true },
            "diversification": { "enabled": true, "lambda": 0.6 },
            "adaptive": { "tokenBudget": 8000, "priority": "balanced" }
          }
        }
      }
    ]
  }
}
```

### Тестирование (детерминированный)

```json
{
  "knowledge": {
    "engines": [
      {
        "id": "mind-test",
        "type": "mind",
        "options": {
          "embedding": {
            "type": "deterministic",
            "provider": {
              "deterministic": { "dimension": 1536 }
            }
          },
          "vectorStore": { "type": "local" },
          "search": { "type": "vector" },
          "reranking": { "enabled": false }
        }
      }
    ]
  }
}
```

---

## Миграция с существующей конфигурации

Если конфигурация не указана, используется режим совместимости:

- `embedding.type: "deterministic"` (текущее поведение)
- `vectorStore.type: "local"` (текущее поведение)
- `chunking.strategy: "line"` (текущее поведение)
- `search.type: "vector"` (текущее поведение)
- Все оптимизации отключены

Для миграции достаточно добавить минимальную конфигурацию:

```json
{
  "knowledge": {
    "engines": [
      {
        "id": "mind-default",
        "type": "mind",
        "options": {
          "embedding": { "type": "auto" },
          "vectorStore": { "type": "auto" }
        }
      }
    ]
  }
}
```

