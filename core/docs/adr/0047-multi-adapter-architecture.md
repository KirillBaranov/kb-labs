# ADR-0047: Multi-Adapter Architecture

**Date:** 2026-01-17
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-01-17
**Tags:** adapter, config, architecture, llm

## Context

The KB Labs platform uses adapters to provide implementations for various services (LLM, embeddings, vector stores, etc.). Originally, the configuration only supported a single adapter per service type:

```json
{
  "adapters": {
    "llm": "@kb-labs/adapters-openai",
    "embeddings": "@kb-labs/adapters-openai/embeddings"
  }
}
```

This limitation became problematic when implementing the LLM Router (ADR-0046), which needs to switch between different LLM providers based on tier configuration. The `adapterOptions.llm.tierMapping` allows specifying different adapters per tier:

```json
{
  "adapterOptions": {
    "llm": {
      "tierMapping": {
        "small": [{ "adapter": "@kb-labs/adapters-openai", "model": "gpt-4o-mini" }],
        "large": [{ "adapter": "@kb-labs/adapters-vibeproxy", "model": "claude-opus-4-5" }]
      }
    }
  }
}
```

However, having adapters declared only in `tierMapping` while `adapters.llm` was a single string created visual inconsistency and made it unclear which adapters would be loaded.

**Similar needs exist for other adapter types:**
- Multiple analytics backends (file + PostHog)
- Multiple cache layers (Redis + in-memory fallback)
- Multiple vector stores (Qdrant for hot, Pinecone for cold)
- Multiple loggers (console + file + external service)

## Decision

Extend the `AdaptersConfig` type to support arrays of adapter packages:

```typescript
// New type for adapter values
type AdapterValue = string | string[] | null;

interface AdaptersConfig {
  llm?: AdapterValue;
  embeddings?: AdapterValue;
  vectorStore?: AdapterValue;
  cache?: AdapterValue;
  storage?: AdapterValue;
  analytics?: AdapterValue;
  logger?: AdapterValue;
  eventBus?: AdapterValue;
}
```

### Configuration Format

**Single adapter (backward compatible):**
```json
{
  "adapters": {
    "llm": "@kb-labs/adapters-openai"
  }
}
```

**Multiple adapters (new):**
```json
{
  "adapters": {
    "llm": ["@kb-labs/adapters-openai", "@kb-labs/adapters-vibeproxy"]
  }
}
```

**Disabled (NoOp):**
```json
{
  "adapters": {
    "analytics": null
  }
}
```

### Loading Behavior

1. **First adapter = Primary**: The first adapter in the array is loaded as the primary/default adapter
2. **Others via `adapterLoader`**: Additional adapters are available through the `adapterLoader` function (used by LLMRouter)
3. **Backward compatibility**: Single string works exactly as before

### Example: Complete LLM Multi-Adapter Setup

```json
{
  "platform": {
    "adapters": {
      "llm": ["@kb-labs/adapters-openai", "@kb-labs/adapters-vibeproxy"],
      "embeddings": "@kb-labs/adapters-openai/embeddings"
    },
    "adapterOptions": {
      "llm": {
        "defaultTier": "small",
        "tierMapping": {
          "small": [
            { "adapter": "@kb-labs/adapters-openai", "model": "gpt-4o-mini", "priority": 1 }
          ],
          "medium": [
            { "adapter": "@kb-labs/adapters-vibeproxy", "model": "claude-sonnet-4-5", "priority": 1 }
          ],
          "large": [
            { "adapter": "@kb-labs/adapters-vibeproxy", "model": "claude-opus-4-5", "priority": 1 }
          ]
        }
      }
    }
  }
}
```

## Consequences

### Positive

- **Visual clarity**: Adapters declared explicitly where they'll be used
- **Flexible resource distribution**: Multiple providers for same service type
- **Future-proof**: Same pattern works for analytics, cache, vector stores
- **Backward compatible**: Existing configs with single strings continue to work
- **Self-documenting**: Config shows all adapters that will be loaded

### Negative

- **Slightly more complex config**: Arrays instead of strings
- **More adapters loaded**: All declared adapters may be loaded (memory impact)

### Alternatives Considered

1. **Keep single adapter + tierMapping only**: Rejected because visually confusing
2. **Separate `primaryAdapter` and `secondaryAdapters` fields**: Rejected - more verbose, less intuitive
3. **Auto-discover from tierMapping**: Rejected - implicit behavior, harder to understand

## Implementation

### Files Changed

1. **`config.ts`**: Added `AdapterValue` type, updated `AdaptersConfig` interface
2. **`loader.ts`**:
   - Added `normalizeAdapterValue()` helper
   - Added `getPrimaryAdapter()` helper
   - Updated adapter loading loop to handle arrays
3. **`kb.config.json`**: Updated to use array format for `llm`
4. **Tests**: Added multi-adapter configuration tests

### Helper Functions

```typescript
function normalizeAdapterValue(value: AdapterValue | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

function getPrimaryAdapter(value: AdapterValue | undefined): string | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
}
```

## References

- [ADR-0046: LLM Router](./0046-llm-router.md)
- [ADR-0043: Adapter Manifest System](./0043-adapter-manifest-system.md)

---

**Last Updated:** 2026-01-17
**Next Review:** 2026-04-17
