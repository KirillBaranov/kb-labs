# ADR-0027: Provider-Agnostic Rate Limiting

**Date:** 2025-11-26
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-26
**Tags:** [architecture, rate-limiting, embedding, scalability]

## Context

When indexing large codebases (2000+ files, 5000+ chunks), we encountered rate limit errors from OpenAI API:

```
Rate limit reached for text-embedding-3-small: Limit 1000000, Used 984596, Requested 58875
```

**Problems with the existing solution:**
1. Parallel workers (EmbeddingStage + OpenAI provider) were not coordinated with each other
2. Hardcoded magic numbers (`batchSize: 200`, `concurrency: 5`) did not account for actual API limits
3. No support for other providers (Sber GigaChat, Yandex GPT, local models)
4. Rate limiting should be in mind-engine, not in the knowledge layer (mind is an optional plugin)

**Alternatives considered:**
1. **Simple backoff on 429** - does not solve the problem of proactive control
2. **Fixed delays between requests** - inefficient quota utilization
3. **Rate limiting in OpenAI provider** - does not allow coordination across multiple layers

## Decision

Implemented a **universal rate limiter** with sliding window tracking in `mind-engine/src/rate-limiting/`:

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     EmbeddingStage                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              UniversalRateLimiter                    │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌───────────────┐  │   │
│  │  │ TPM Tracker │ │ RPM Tracker │ │ Concurrent    │  │   │
│  │  │ (minute)    │ │ (minute)    │ │ Requests      │  │   │
│  │  └─────────────┘ └─────────────┘ └───────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│                    acquire(tokens)                          │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              OpenAI Provider                         │   │
│  │              (concurrency: 1)                        │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Components

1. **RateLimitConfig** - configuration interface:
   ```typescript
   interface RateLimitConfig {
     tokensPerMinute?: number;      // TPM (OpenAI)
     requestsPerMinute?: number;    // RPM
     requestsPerSecond?: number;    // RPS (Sber/Yandex)
     maxConcurrentRequests?: number; // For local models
     strategy?: 'wait' | 'backoff' | 'queue';
     safetyMargin?: number;         // 0.85-0.9 of limit
   }
   ```

2. **RATE_LIMIT_PRESETS** - presets for providers:
   - `openai-tier-1` through `openai-tier-5`
   - `sber-gigachat`, `yandex-gpt`
   - `ollama-local`, `vllm-local`, `tei-local`

3. **UniversalRateLimiter** - rate limiter with:
   - Sliding window for TPM/RPM/RPS
   - Concurrent requests tracking
   - Automatic wait when limit is reached
   - Usage statistics

### Parallelism Coordination

- **OpenAI provider**: `concurrency: 1` (sequential requests)
- **EmbeddingStage**: `maxConcurrency: 3` with rate limiter
- Rate limiter prevents TPM overflow even with parallel workers

## Consequences

### Positive

- **No 429 errors** - rate limiter waits before request, not after error
- **Provider-agnostic** - single system for OpenAI, Sber, local models
- **Configurable** - presets or custom configuration via `kb.config.json`
- **Transparent** - metrics `rateLimiterWaits`, `rateLimiterWaitTime` in logs
- **Efficient** - uses 85-90% of quota without exceeding

### Negative

- **Additional latency** - waiting when approaching the limit
- **Token estimation overhead** - ~4 chars/token heuristic may be inaccurate
- **Memory overhead** - storing timestamps in sliding window

### Alternatives Considered

1. **Embed rate limiting in OpenAI provider**
   - Rejected: does not allow coordination with EmbeddingStage

2. **Use existing library (bottleneck, p-limit)**
   - Rejected: do not support TPM-based limiting

3. **Server-side rate limiter**
   - Rejected: adds dependency, complicates deployment

## Implementation

### New Files

```
mind-engine/src/rate-limiting/
├── index.ts              # Module exports
├── rate-limit-config.ts  # Interfaces and presets
└── rate-limiter.ts       # UniversalRateLimiter class
```

### Usage

```typescript
// EmbeddingStage with rate limiting
const embeddingStage = new EmbeddingStage(provider, chunks, {
  maxConcurrency: 3,
  rateLimits: 'openai-tier-1', // or custom config
});

// In execute():
const estimatedTokens = estimateBatchTokens(texts);
await this.rateLimiter.acquire(estimatedTokens);
const embeddings = await provider.embedBatch(texts);
this.rateLimiter.release();
```

### Configuration via kb.config.json

```json
{
  "mind": {
    "embedding": {
      "rateLimits": "openai-tier-2"
    }
  }
}
```

## References

- [OpenAI Rate Limits](https://platform.openai.com/docs/guides/rate-limits)
- [ADR-0017: Embedding Provider Abstraction](./0017-embedding-provider-abstraction.md)
- [ADR-0021: Incremental Indexing](./0021-incremental-indexing.md)

---

**Last Updated:** 2025-11-26
**Next Review:** 2026-02-26
