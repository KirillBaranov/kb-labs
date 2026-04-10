# ADR-0048: LLM Router v2 - Metadata-Based Routing

**Date:** 2026-01-18
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-01-18
**Tags:** llm, router, architecture, analytics, refactor

## Context

The LLM Router (ADR-0046) was designed to enable tier-based model selection via `useLLM({ tier: 'medium' })`. However, the implementation had a critical flaw:

**Problem:** The wrapper chain was ordered as:
```
QueuedLLM → AnalyticsLLM → LLMRouter → RawAdapter
```

When `useLLM({ tier: 'medium' })` called `isLLMRouter(platform.llm)`, it checked `QueuedLLM` which doesn't implement `ILLMRouter`. Therefore, `resolve()` was never called and all requests used the default tier (small).

**Symptoms:**
- Analytics only showed `gpt-4o-mini` usage (default tier model)
- `useLLM({ tier: 'large' })` had no effect
- ResourceBroker always used `llm` resource, not `llm:openai` or `llm:anthropic`

## Decision

Implement metadata-based routing with a corrected wrapper chain order.

### 1. New Wrapper Chain Order

```
LLMRouter → QueuedLLM → AnalyticsLLM → RawAdapter
```

LLMRouter is now the **outermost** wrapper, allowing `useLLM({ tier })` to call `resolve()` directly.

### 2. Metadata Flow

Instead of each wrapper needing to understand routing, LLMRouter injects metadata into every request:

```typescript
// LLMRouter.withModelAndMetadata()
private withModelAndMetadata(options?: LLMOptions): LLMOptions {
  const metadata: LLMRequestMetadata = {
    tier: this.currentTier,      // 'small' | 'medium' | 'large'
    provider: this.currentProvider, // 'openai' | 'anthropic'
    resource: this.currentResource, // 'llm:openai' | 'llm:anthropic'
  };

  return {
    ...options,
    model: options?.model ?? this.currentModel,
    metadata: { ...metadata, ...options?.metadata },
  };
}
```

### 3. Downstream Wrappers Read Metadata

**QueuedLLM** - routes to correct ResourceBroker resource:
```typescript
async complete(prompt: string, options?: QueuedLLMOptions) {
  const resource = options?.metadata?.resource ?? 'llm';
  return this.broker.enqueue({ resource, ... });
}
```

**AnalyticsLLM** - tracks tier/provider in events:
```typescript
await this.analytics.track('llm.completion.completed', {
  tier: options?.metadata?.tier,
  provider: options?.metadata?.provider,
  model: response.model,
  ...
});
```

## Consequences

### Positive

- **Tier switching works**: `useLLM({ tier: 'medium' })` now correctly switches models
- **Accurate analytics**: Events include tier/provider/model information
- **Dynamic resource routing**: QueuedLLM routes to `llm:openai` or `llm:anthropic`
- **Backward compatible**: Default metadata values maintain existing behavior
- **Simpler debugging**: Metadata visible in analytics events

### Negative

- **4-layer wrapper chain**: LLMRouter → QueuedLLM → AnalyticsLLM → RawAdapter
- **Metadata in every call**: Slight overhead from additional object properties
- **Complex initialization**: loader.ts has LLMRouter wrapping after ResourceBroker

### Technical Debt Note

The current 4-layer wrapper architecture works but is complex. Future consideration should be given to:

1. **Middleware pattern**: Composable `llm.use(middleware)` approach
2. **Single managed wrapper**: One class with feature flags
3. **Decorator composition**: `@analytics @queue @router` style

This would reduce layers and improve debuggability.

## Implementation

### Files Changed

1. **`llm.ts`** (core-platform): Added `LLMRequestMetadata` interface
2. **`llm-types.ts`** (core-platform): Added `resource` field to `LLMResolution`
3. **`router.ts`** (llm-router):
   - Added `provider` field to `TierModelEntry`
   - Added `currentTier`, `currentProvider`, `currentResource` state
   - Added `withModelAndMetadata()` method
4. **`analytics-llm.ts`** (core-platform): Read and track metadata
5. **`queued-llm.ts`** (core-resource-broker): Use `metadata.resource` for routing
6. **`loader.ts`** (core-runtime): Changed wrapper order

### Type Changes

```typescript
// LLMRequestMetadata - new type
interface LLMRequestMetadata {
  tier?: LLMTier;
  provider?: string;
  resource?: string;
}

// LLMOptions - added metadata field
interface LLMOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
  systemPrompt?: string;
  metadata?: LLMRequestMetadata; // NEW
}

// TierModelEntry - added provider field
interface TierModelEntry {
  model: string;
  priority: number;
  capabilities?: LLMCapability[];
  provider?: string;           // NEW (recommended)
  /** @deprecated */ adapter?: string;
}
```

## References

- [ADR-0046: LLM Router](./0046-llm-router.md)
- [ADR-0047: Multi-Adapter Architecture](./0047-multi-adapter-architecture.md)
- [Plan Document](../../docs/LLM-ROUTER-V2-REFACTOR-PLAN.md)

---

**Last Updated:** 2026-01-18
**Next Review:** 2026-04-18
