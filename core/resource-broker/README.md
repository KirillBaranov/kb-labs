# @kb-labs/core-resource-broker

Centralized queue, rate limiting, and retry management for heavy platform resources (LLM, embeddings, vector store).

## Overview

Wraps platform adapters with a priority queue, configurable rate limits, and automatic retry with exponential backoff. Supports single-process (in-memory) and distributed (state-broker HTTP daemon) rate limiting backends.

## Quick Start

```typescript
import {
  ResourceBroker,
  InMemoryRateLimitBackend,
  createQueuedLLM,
} from '@kb-labs/core-resource-broker';

const backend = new InMemoryRateLimitBackend();
const broker = new ResourceBroker(backend);

// Wrap existing LLM adapter — transparent drop-in replacement
const llm = createQueuedLLM(broker, rawLLMAdapter);

// Requests are now automatically queued, rate-limited, and retried
const response = await llm.complete({ prompt: 'Hello' });
```

## Queued Adapters

Drop-in wrappers that add queuing and rate limiting to existing adapters:

| Factory | Wraps |
|---------|-------|
| `createQueuedLLM()` | `LLMAdapter` |
| `createQueuedEmbeddings()` | `EmbeddingsAdapter` |
| `createQueuedVectorStore()` | `VectorStoreAdapter` |

## Rate Limit Backends

| Backend | Use case |
|---------|----------|
| `InMemoryRateLimitBackend` | Single process — development, CLI tools |
| `StateBrokerRateLimitBackend` | Distributed — multi-instance REST API deployments |

```typescript
// Distributed mode (requires core-state-daemon running)
import { StateBrokerRateLimitBackend } from '@kb-labs/core-resource-broker';

const backend = new StateBrokerRateLimitBackend({
  url: 'http://localhost:7777',
});
```

## Rate Limit Presets

```typescript
import { RATE_LIMIT_PRESETS, getRateLimitConfig } from '@kb-labs/core-resource-broker';

broker.register('llm', {
  rateLimits: 'openai-tier-2',  // preset: 3500 RPM, 90k TPM
  executor: (op, args) => llmAdapter[op](...args),
});

// Or custom config
broker.register('embeddings', {
  rateLimits: { requestsPerMinute: 1000, tokensPerMinute: 1_000_000 },
  executor: (op, args) => embeddingsAdapter[op](...args),
});
```

## Priority Queue

```typescript
// High-priority requests jump the queue
const result = await broker.execute('llm', 'complete', [prompt], {
  priority: 'high',   // 'high' | 'normal' | 'low'
});
```

## Retry Configuration

```typescript
const broker = new ResourceBroker(backend, {
  retry: {
    maxAttempts: 3,
    initialDelay: 1000,   // ms
    maxDelay: 30_000,
    jitter: true,
  },
});
// Automatically retries on 429 (respects Retry-After header) and 5xx errors
```

## License

KB Public License v1.1 © KB Labs
