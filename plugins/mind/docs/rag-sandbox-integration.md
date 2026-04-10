# Интеграция RAG улучшений в Sandbox окружение

**Дата:** 2025-01-XX  
**Статус:** Критический анализ  
**Проблема:** Как реализовать RAG улучшения в рамках плагина mind, который выполняется в sandbox

## Проблема

### Текущее состояние

**Mind плагин выполняется в sandbox с ограничениями:**

```typescript
// kb-labs-mind/packages/mind-cli/src/manifest.v3.ts
permissions: {
  fs: {
    mode: 'readWrite',
    allow: ['.kb/mind/**', 'package.json'],
  },
  net: 'none',  // ❌ Сетевые запросы ЗАПРЕЩЕНЫ
  env: {
    allow: ['NODE_ENV', 'KB_LABS_*'],
  },
  quotas: {
    timeoutMs: 60000,
    memoryMb: 512,
  },
}
```

**Ограничения sandbox:**
- ✅ **FS доступ**: Только разрешенные пути (`.kb/mind/**`)
- ❌ **Network доступ**: Запрещен (`net: 'none'`)
- ✅ **Env доступ**: Только whitelisted переменные
- ✅ **Quotas**: Timeout 60s, Memory 512MB

### Что нужно для RAG улучшений

1. **OpenAI API** - HTTP запросы к `api.openai.com`
2. **Qdrant** - HTTP запросы к `localhost:6333` или удаленному серверу
3. **Elasticsearch** (опционально) - HTTP запросы к ES серверу
4. **Локальные модели** - Могут работать без сети

---

## Решения

### Решение 1: Изменить permissions в манифесте (Рекомендуется)

**Идея:** Добавить network permissions с whitelist доменов

```typescript
// kb-labs-mind/packages/mind-cli/src/manifest.v3.ts
permissions: {
  fs: {
    mode: 'readWrite',
    allow: ['.kb/mind/**', 'package.json'],
  },
  net: {
    allow: [
      'api.openai.com',           // OpenAI API
      'localhost',                 // Локальный Qdrant
      '127.0.0.1',                 // Локальный Qdrant
      '*.qdrant.io',               // Qdrant Cloud (опционально)
      '*.elastic-cloud.com',       // Elasticsearch Cloud (опционально)
    ],
    deny: [],
  },
  env: {
    allow: [
      'NODE_ENV',
      'KB_LABS_*',
      'OPENAI_API_KEY',            // ✅ Для OpenAI
      'QDRANT_URL',                // ✅ Для Qdrant
      'QDRANT_API_KEY',            // ✅ Для Qdrant
      'ES_URL',                    // ✅ Для Elasticsearch
      'ES_API_KEY',                // ✅ Для Elasticsearch
    ],
  },
  quotas: {
    timeoutMs: 300000,             // Увеличить до 5 минут для индексации
    memoryMb: 1024,                // Увеличить до 1GB для больших проектов
    cpuMs: 180000,                 // 3 минуты CPU
  },
}
```

**Преимущества:**
- ✅ Работает с внешними сервисами
- ✅ Безопасно (whitelist доменов)
- ✅ Гибко (можно добавить новые домены)

**Недостатки:**
- ⚠️ Требует изменения манифеста
- ⚠️ Нужно обновить документацию по безопасности

**Реализация:**

```typescript
// packages/mind-engine/src/adapters/openai.ts
export async function createOpenAIEmbeddingProvider(
  options: { apiKey: string; model?: string },
  runtime: { fetch: typeof fetch }  // ← Получаем fetch из runtime
): Promise<EmbeddingProvider> {
  return {
    id: 'openai',
    async embed(texts: string[]) {
      // Используем runtime.fetch вместо глобального fetch
      const response = await runtime.fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: options.model ?? 'text-embedding-3-small',
          input: texts,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.data.map((item: any) => ({
        dim: item.embedding.length,
        values: item.embedding,
      }));
    },
  };
}
```

**Использование в handler:**

```typescript
// packages/mind-cli/src/cli/commands/rag-index.ts
export async function run(input, ctx) {
  // Получаем fetch из runtime (уже whitelisted)
  const fetch = ctx.runtime.fetch;
  
  // Создаем embedding провайдер с runtime.fetch
  const embeddingProvider = createOpenAIEmbeddingProvider(
    {
      apiKey: ctx.runtime.env.get('OPENAI_API_KEY'),
      model: 'text-embedding-3-small',
    },
    { fetch }  // ← Передаем runtime.fetch
  );
  
  // Используем провайдер
  const embeddings = await embeddingProvider.embed(['text1', 'text2']);
  
  // ...
}
```

---

### Решение 2: Локальные сервисы (Альтернатива)

**Идея:** Использовать только локальные сервисы, не требующие network

**Для Qdrant:**
```bash
# Запуск локально через Docker
docker run -p 6333:6333 qdrant/qdrant

# Или встроенный Qdrant (если есть Node.js клиент)
```

**Для Embeddings:**
```typescript
// Использовать локальные модели через Ollama или встроенные
import { createLocalEmbeddingProvider } from '@kb-labs/mind-embeddings';

const provider = createLocalEmbeddingProvider({
  model: 'nomic-embed',  // Локальная модель
  endpoint: 'http://localhost:11434',  // Ollama локально
});
```

**Преимущества:**
- ✅ Не требует изменения permissions
- ✅ Работает полностью offline
- ✅ Безопаснее (нет внешних запросов)

**Недостатки:**
- ❌ Требует локальной установки Qdrant/Ollama
- ❌ Хуже качество embeddings (локальные модели)
- ❌ Сложнее для пользователей

---

### Решение 3: Гибридный подход (Рекомендуется)

**Идея:** Поддержка обоих режимов с автоматическим выбором

```typescript
// packages/mind-engine/src/factory.ts
export function createEmbeddingProvider(
  config: EmbeddingConfig,
  runtime: { fetch?: typeof fetch; env: EnvAccessor }
): EmbeddingProvider {
  const type = config.type ?? 'auto';
  
  // Автоматический выбор на основе доступности
  if (type === 'auto') {
    // Проверить доступность OpenAI API
    if (runtime.env.get('OPENAI_API_KEY') && runtime.fetch) {
      return createOpenAIEmbeddingProvider(
        { apiKey: runtime.env.get('OPENAI_API_KEY')! },
        { fetch: runtime.fetch }
      );
    }
    
    // Fallback на локальную модель
    return createLocalEmbeddingProvider({
      model: 'nomic-embed',
    });
  }
  
  // Явный выбор
  switch (type) {
    case 'openai':
      if (!runtime.fetch) {
        throw new Error('Network access required for OpenAI provider');
      }
      return createOpenAIEmbeddingProvider(config.options, { fetch: runtime.fetch });
    
    case 'local':
      return createLocalEmbeddingProvider(config.options);
    
    default:
      throw new Error(`Unknown embedding type: ${type}`);
  }
}
```

**Конфигурация:**

```json
{
  "knowledge": {
    "engines": [{
      "options": {
        "embedding": {
          "type": "auto",  // Автоматический выбор
          "options": {
            "openai": {
              "model": "text-embedding-3-small"
            },
            "local": {
              "model": "nomic-embed"
            }
          }
        },
        "vectorStore": {
          "type": "auto",  // Автоматический выбор
          "options": {
            "qdrant": {
              "url": "${QDRANT_URL:-http://localhost:6333}"
            },
            "local": {
              "type": "sqlite"
            }
          }
        }
      }
    }]
  }
}
```

---

## Архитектура интеграции

### Слои абстракции

```
┌─────────────────────────────────────────┐
│         Plugin Handler                   │
│  (rag-index, rag-query commands)         │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│      Mind Knowledge Engine               │
│  (orchestrates RAG pipeline)            │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴────────┐
       │                │
       ▼                ▼
┌──────────────┐  ┌──────────────┐
│  Embedding   │  │  Vector      │
│  Provider    │  │  Store       │
│  (OpenAI/    │  │  (Qdrant/    │
│   Local)     │  │   Local)     │
└──────┬───────┘  └──────┬───────┘
       │                 │
       │                 │
       ▼                 ▼
┌─────────────────────────────────────────┐
│      Runtime API                        │
│  - ctx.runtime.fetch (whitelisted)      │
│  - ctx.runtime.env (filtered)           │
│  - ctx.runtime.fs (restricted)          │
└─────────────────────────────────────────┘
```

### Адаптеры для Runtime API

```typescript
// packages/mind-engine/src/adapters/runtime-adapter.ts

export interface RuntimeAdapter {
  fetch: typeof fetch;
  env: {
    get(key: string): string | undefined;
  };
  fs: {
    readFile(path: string): Promise<string>;
    writeFile(path: string, data: string): Promise<void>;
  };
}

export class MindKnowledgeEngine {
  constructor(
    config: KnowledgeEngineConfig,
    runtime: RuntimeAdapter  // ← Получаем runtime из sandbox
  ) {
    // Используем runtime.fetch для HTTP запросов
    // Используем runtime.env для переменных окружения
    // Используем runtime.fs для файловой системы
  }
}
```

**Использование в handler:**

```typescript
// packages/mind-cli/src/cli/commands/rag-index.ts
export async function run(input, ctx) {
  // Создаем runtime adapter из sandbox context
  const runtimeAdapter: RuntimeAdapter = {
    fetch: ctx.runtime.fetch,      // Whitelisted fetch
    env: ctx.runtime.env,           // Filtered env
    fs: ctx.runtime.fs,             // Restricted fs
  };
  
  // Создаем engine с runtime adapter
  const engine = new MindKnowledgeEngine(config, runtimeAdapter);
  
  // Используем engine
  await engine.index(sources, options);
}
```

---

## Конкретный план реализации

### Шаг 1: Обновить манифест

```typescript
// packages/mind-cli/src/manifest.v3.ts

permissions: {
  // ... существующие permissions ...
  
  net: {
    allow: [
      'api.openai.com',
      'localhost',
      '127.0.0.1',
      '*.qdrant.io',
    ],
    deny: [],
  },
  
  env: {
    allow: [
      'NODE_ENV',
      'KB_LABS_*',
      'OPENAI_API_KEY',
      'QDRANT_URL',
      'QDRANT_API_KEY',
    ],
  },
  
  quotas: {
    timeoutMs: 300000,  // 5 минут для индексации
    memoryMb: 1024,      // 1GB для больших проектов
  },
}
```

### Шаг 2: Создать Runtime Adapter

```typescript
// packages/mind-engine/src/adapters/runtime-adapter.ts

export interface RuntimeAdapter {
  fetch: typeof fetch;
  env: EnvAccessor;
  fs: FSAccessor;
}

export function createRuntimeAdapter(ctx: ExecutionContext): RuntimeAdapter {
  return {
    fetch: ctx.runtime.fetch,
    env: ctx.runtime.env,
    fs: ctx.runtime.fs,
  };
}
```

### Шаг 3: Обновить Embedding Provider

```typescript
// packages/mind-embeddings/src/providers/openai.ts

export function createOpenAIEmbeddingProvider(
  config: { apiKey: string; model?: string },
  runtime: { fetch: typeof fetch }  // ← Runtime fetch
): EmbeddingProvider {
  return {
    id: 'openai',
    async embed(texts: string[]) {
      const response = await runtime.fetch('https://api.openai.com/v1/embeddings', {
        // ... используем runtime.fetch
      });
      // ...
    },
  };
}
```

### Шаг 4: Обновить Vector Store

```typescript
// packages/mind-vector-store-qdrant/src/qdrant-adapter.ts

export class QdrantAdapter {
  constructor(
    options: QdrantOptions,
    runtime: { fetch: typeof fetch }  // ← Runtime fetch
  ) {
    this.fetch = runtime.fetch;
  }
  
  async search(...) {
    const response = await this.fetch(`${this.url}/collections/${collection}/points/search`, {
      // ... используем runtime.fetch
    });
    // ...
  }
}
```

### Шаг 5: Обновить Handlers

```typescript
// packages/mind-cli/src/cli/commands/rag-index.ts

export async function run(input, ctx) {
  // Создаем runtime adapter
  const runtime = createRuntimeAdapter(ctx);
  
  // Создаем embedding provider с runtime
  const embeddingProvider = createOpenAIEmbeddingProvider(
    { apiKey: runtime.env.get('OPENAI_API_KEY')! },
    { fetch: runtime.fetch }
  );
  
  // Создаем vector store с runtime
  const vectorStore = new QdrantAdapter(
    { url: runtime.env.get('QDRANT_URL') ?? 'http://localhost:6333' },
    { fetch: runtime.fetch }
  );
  
  // Создаем engine
  const engine = new MindKnowledgeEngine(config, {
    embeddingProvider,
    vectorStore,
    runtime,
  });
  
  // Используем engine
  await engine.index(sources, options);
}
```

---

## Безопасность

### Whitelist доменов

**Разрешенные домены:**
- `api.openai.com` - OpenAI API
- `localhost`, `127.0.0.1` - Локальные сервисы
- `*.qdrant.io` - Qdrant Cloud (опционально)

**Запрещенные:**
- Все остальные домены по умолчанию

### Переменные окружения

**Разрешенные:**
- `OPENAI_API_KEY` - Только для embedding провайдера
- `QDRANT_URL` - URL Qdrant сервера
- `QDRANT_API_KEY` - API ключ Qdrant (если нужен)

**Запрещенные:**
- Системные переменные (PATH, HOME, etc.)
- Секреты других плагинов

### Quotas

**Увеличенные лимиты:**
- Timeout: 5 минут (для индексации больших проектов)
- Memory: 1GB (для обработки больших файлов)
- CPU: 3 минуты

---

## Тестирование в Sandbox

### Локальное тестирование

```bash
# 1. Запустить Qdrant локально
docker run -p 6333:6333 qdrant/qdrant

# 2. Установить переменные окружения
export OPENAI_API_KEY=sk-...
export QDRANT_URL=http://localhost:6333

# 3. Запустить команду
kb mind rag:index --scope frontend
```

### Тестирование permissions

```typescript
// packages/mind-cli/src/__tests__/sandbox-permissions.spec.ts

describe('Sandbox permissions', () => {
  it('should allow OpenAI API requests', async () => {
    const result = await executeCommand('rag:index', {
      env: { OPENAI_API_KEY: 'test-key' },
      permissions: {
        net: { allow: ['api.openai.com'] },
      },
    });
    
    expect(result.ok).toBe(true);
  });
  
  it('should deny unauthorized domains', async () => {
    const result = await executeCommand('rag:index', {
      permissions: {
        net: { allow: ['api.openai.com'], deny: ['evil.com'] },
      },
    });
    
    // Попытка запроса к evil.com должна быть заблокирована
  });
});
```

---

## Миграция

### Поэтапное внедрение

**Фаза 1: Подготовка (без изменений permissions)**
- ✅ Создать runtime adapter интерфейс
- ✅ Обновить embedding provider для использования runtime.fetch
- ✅ Обновить vector store для использования runtime.fetch
- ✅ Тесты с mock runtime

**Фаза 2: Обновление permissions**
- ✅ Обновить манифест с network permissions
- ✅ Обновить документацию
- ✅ Тесты в реальном sandbox

**Фаза 3: Production**
- ✅ Мониторинг network запросов
- ✅ Логирование использования внешних сервисов
- ✅ Fallback на локальные сервисы при ошибках

---

## Итоговые рекомендации

### ✅ Рекомендуемый подход

1. **Изменить permissions в манифесте**
   - Добавить `net: { allow: [...] }` с whitelist доменов
   - Добавить необходимые env переменные
   - Увеличить quotas для индексации

2. **Использовать Runtime API**
   - Все HTTP запросы через `ctx.runtime.fetch`
   - Все env переменные через `ctx.runtime.env`
   - Все FS операции через `ctx.runtime.fs`

3. **Гибридный режим**
   - Поддержка внешних сервисов (OpenAI, Qdrant)
   - Fallback на локальные сервисы
   - Автоматический выбор на основе доступности

4. **Безопасность**
   - Whitelist доменов
   - Фильтрация env переменных
   - Мониторинг network запросов

### ⚠️ Важные моменты

- **Sandbox изоляция сохраняется** - плагин все еще изолирован
- **Network доступ контролируется** - только whitelisted домены
- **Quotas применяются** - timeout и memory лимиты действуют
- **Runtime API обязателен** - нельзя использовать глобальный fetch

---

## Заключение

Все RAG улучшения **можно реализовать в рамках плагина mind** с правильной архитектурой:

1. ✅ Использовать Runtime API из sandbox
2. ✅ Обновить permissions в манифесте
3. ✅ Создать адаптеры для внешних сервисов
4. ✅ Поддержать гибридный режим (внешние + локальные)

**Ключевой принцип:** Все внешние запросы должны идти через `ctx.runtime.fetch`, который уже имеет whitelist проверки на уровне sandbox.





