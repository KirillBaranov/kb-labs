# ADR-0030: Mind Analytics Integration

**Date:** 2025-11-26
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-26
**Tags:** analytics, metrics, observability, cost-tracking

## Context

Mind RAG queries involve multiple stages (decomposition, retrieval, synthesis) with varying performance characteristics. To understand and optimize the system, we need:

1. **Performance metrics** - Query duration, per-stage timing
2. **Quality metrics** - Confidence scores, completeness, source counts
3. **Cost tracking** - LLM token usage, estimated costs
4. **Usage patterns** - Query modes, cache hit rates, iteration counts
5. **Error tracking** - Failure rates, error types

KB Labs has a centralized analytics system (`@kb-labs/analytics-sdk-node`) that provides:
- Event buffering with offline support
- Batch sync to backend
- Profile-based configuration
- Type-safe event emission

Alternatives considered:
- **Custom metrics file**: Simple but loses centralized aggregation
- **Direct DB writes**: Adds complexity, coupling
- **Third-party APM**: Overhead, external dependency

## Decision

Integrate Mind query metrics with `@kb-labs/analytics-sdk-node` using a thin wrapper that:

1. Never breaks query execution on analytics failures
2. Captures timing at each pipeline stage
3. Calculates LLM costs based on configurable pricing
4. Hashes queries for privacy while enabling aggregation

### Event Types

| Event | Trigger | Purpose |
|-------|---------|---------|
| `mind.query.started` | Query begins | Track query volume, modes |
| `mind.query.completed` | Query succeeds | Performance, quality, costs |
| `mind.query.failed` | Query fails | Error tracking |
| `mind.decompose.completed` | Decomposition done | Sub-query analysis |
| `mind.gather.completed` | Chunk gathering done | Retrieval metrics |
| `mind.check.completed` | Completeness check done | Quality assessment |
| `mind.synthesize.completed` | Synthesis done | LLM performance |

### Payload Schema

```typescript
interface QueryCompletedPayload {
  // Identity
  queryId: string;
  queryHash: string;        // SHA256 for privacy

  // Timing
  durationMs: number;

  // Quality
  confidence: number;       // 0-1
  complete: boolean;
  sourcesCount: number;
  sourcesBreakdown: {
    code: number;
    docs: number;
    external: Record<string, number>;
  };

  // LLM Usage
  llmCalls: number;
  tokensIn: number;
  tokensOut: number;

  // Costs
  costLlm: number;          // USD
  costTotal: number;        // USD (LLM + future: embeddings, etc.)

  // Context
  cached: boolean;
  mode: AgentQueryMode;
  subqueriesCount: number;
  iterationsCount: number;
  compressionApplied: boolean;
}
```

### Cost Calculation

```typescript
const DEFAULT_LLM_COSTS = {
  'gpt-4o-mini': {
    inputCostPerMillion: 0.15,   // $0.15 per 1M input tokens
    outputCostPerMillion: 0.60,  // $0.60 per 1M output tokens
  },
  'gpt-4o': {
    inputCostPerMillion: 2.50,
    outputCostPerMillion: 10.00,
  },
};

function calculateLLMCost(tokensIn: number, tokensOut: number, model: string): number {
  const config = DEFAULT_LLM_COSTS[model] ?? DEFAULT_LLM_COSTS['gpt-4o-mini'];
  return (tokensIn / 1_000_000) * config.inputCostPerMillion +
         (tokensOut / 1_000_000) * config.outputCostPerMillion;
}
```

### Analytics Context

A mutable context object accumulates metrics across pipeline stages:

```typescript
interface MindAnalyticsContext {
  queryId: string;
  queryHash: string;
  startTime: number;
  mode: AgentQueryMode;

  // Accumulated metrics
  llmCalls: number;
  tokensIn: number;
  tokensOut: number;
  chunksRetrieved: number;
  subqueries: string[];
  iterations: number;
}
```

### Silent Error Handling

Analytics must never break query execution:

```typescript
const safeEmit = async (type: string, payload: Record<string, unknown>) => {
  if (!enabled) return;
  try {
    await emit({ type, source: 'mind', payload });
  } catch {
    // Silently ignore - analytics should never break queries
  }
};
```

## Consequences

### Positive

- **Centralized metrics**: All KB Labs products use same analytics infrastructure
- **Offline support**: Events buffered locally, synced when online
- **Cost visibility**: Track LLM spending per query
- **Quality insights**: Confidence trends, completeness rates
- **Zero-impact failures**: Analytics errors don't affect query results

### Negative

- **Dependency**: Requires `analytics-sdk-node` package
- **Storage**: Local buffer grows until sync
- **Configuration**: Requires analytics profile setup for sync

### Alternatives Considered

1. **Structured logging**: JSON logs with metrics
   - Rejected: No aggregation, harder to query

2. **OpenTelemetry**: Industry-standard observability
   - Rejected: Heavyweight for current needs, can migrate later

3. **In-memory counters**: Simple process-level stats
   - Rejected: Lost on restart, no persistence

## Implementation

### Package Structure

```
mind-orchestrator/src/analytics/
├── types.ts           # Event payload types, cost config
├── mind-analytics.ts  # Analytics wrapper with tracking functions
└── index.ts           # Exports
```

### Usage in Orchestrator

```typescript
import { createMindAnalytics } from './analytics/index.js';

export function createAgentQueryOrchestrator(options) {
  const analytics = createMindAnalytics(options.analytics);

  return {
    async query(input) {
      const ctx = analytics.createContext({ mode: input.mode, query: input.text });
      await analytics.trackQueryStart(ctx);

      try {
        // ... pipeline execution with ctx updates ...
        await analytics.trackQueryCompleted(ctx, result);
        return result;
      } catch (error) {
        await analytics.trackQueryFailed(ctx, error);
        throw error;
      }
    }
  };
}
```

### Dashboard Queries (Future)

```sql
-- Average query duration by mode
SELECT mode, AVG(durationMs) as avg_duration
FROM mind_events
WHERE type = 'mind.query.completed'
GROUP BY mode;

-- Daily LLM costs
SELECT DATE(timestamp) as date, SUM(costLlm) as total_cost
FROM mind_events
WHERE type = 'mind.query.completed'
GROUP BY DATE(timestamp);

-- Low confidence queries for review
SELECT queryHash, confidence, sourcesCount
FROM mind_events
WHERE type = 'mind.query.completed' AND confidence < 0.5;
```

## References

- [ADR-0029: Agent Query Orchestration](./0029-agent-query-orchestration.md)
- [@kb-labs/analytics-sdk-node](../../kb-labs-analytics/packages/analytics-sdk-node/)
- [Analytics Event Schema](../../packages/mind-orchestrator/src/analytics/types.ts)

---

**Last Updated:** 2024-11-26
