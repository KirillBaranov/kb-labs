# ADR-0017: Embedding Provider Abstraction for Multi-Model Support

**Date:** 2025-11-18
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-18
**Tags:** [architecture, embeddings, abstraction]

## Context

Mind v2 needs to generate vector embeddings for semantic search. Different scenarios require different embedding models:

- **Production**: High-quality embeddings from OpenAI (text-embedding-3-small/large)
- **Development/Testing**: Deterministic embeddings without API dependencies
- **Future**: Local models (Ollama, local transformers)

We need a flexible system that supports multiple embedding providers while maintaining consistent interfaces.

## Decision

We will implement a **pluggable embedding provider abstraction** with factory pattern:

1. **EmbeddingProvider Interface**: Common interface for all providers
2. **Factory Function**: `createEmbeddingProvider()` selects provider based on config
3. **Auto Mode**: Automatically selects provider based on available API keys
4. **Deterministic Fallback**: Always available, no external dependencies

### Architecture

```typescript
export interface EmbeddingProvider {
  embed(texts: string[]): Promise<EmbeddingVector[]>;
  dimension: number;
}

export function createEmbeddingProvider(
  config: EmbeddingProviderConfig,
  runtime: EmbeddingRuntimeAdapter,
): EmbeddingProvider {
  if (config.type === 'auto') {
    // Check for OpenAI API key
    const hasOpenAIKey = runtime.env.get('OPENAI_API_KEY');
    return hasOpenAIKey 
      ? new OpenAIEmbeddingProvider({ ... })
      : new DeterministicEmbeddingProvider();
  }
  
  switch (config.type) {
    case 'openai': return new OpenAIEmbeddingProvider({ ... });
    case 'deterministic': return new DeterministicEmbeddingProvider();
    case 'local': return new LocalEmbeddingProvider({ ... });
  }
}
```

### Implementations

1. **OpenAIEmbeddingProvider**: Production-quality embeddings
   - Uses OpenAI API (text-embedding-3-small/large)
   - Dimension: 1536
   - High semantic accuracy
   - Requires API key

2. **DeterministicEmbeddingProvider**: Fallback for development
   - No external dependencies
   - Dimension: 384
   - Deterministic (same input → same output)
   - Suitable for testing and offline development

## Rationale

### Why Abstraction?

- **Flexibility**: Easy to add new providers (Ollama, local models)
- **Development**: Works without API keys
- **Testing**: Deterministic embeddings for reproducible tests
- **Production**: High-quality embeddings when available

### Why Auto Mode?

- **Developer Experience**: Works out of the box
- **Graceful Degradation**: Falls back to deterministic if no API key
- **Configuration**: Can override with explicit config

### Why Deterministic Fallback?

- **Offline Development**: Works without internet
- **Testing**: Reproducible test results
- **Cost**: No API costs for development
- **Speed**: Fast, no network calls

## Consequences

### Positive

- **Flexibility**: Easy to add new providers
- **Developer Experience**: Works without setup
- **Cost Control**: Can use free deterministic for development
- **Testing**: Reproducible with deterministic embeddings
- **Production Ready**: High-quality embeddings available

### Negative

- **Quality Trade-off**: Deterministic embeddings less accurate
- **Dimension Mismatch**: Different providers have different dimensions
- **Migration**: Switching providers requires re-indexing

### Mitigation Strategies

- **Dimension Handling**: Vector store handles different dimensions
- **Clear Documentation**: Document quality differences
- **Migration Tools**: Provide utilities for re-indexing

## Implementation

### Configuration

```json
{
  "knowledge": {
    "engines": [{
      "options": {
        "embedding": {
          "type": "auto"
        }
      }
    }]
  }
}
```

### Auto Mode Behavior

1. Check for `OPENAI_API_KEY` environment variable
2. If found, use OpenAI provider
3. Otherwise, use Deterministic provider
4. Log selection for debugging

### Dimension Handling

- Vector store collections created with correct dimension
- Dimension inferred from provider config
- Error if dimension mismatch detected

## Testing Strategy

- Unit tests for each provider
- Integration tests for factory selection
- Test auto-mode fallback behavior
- Test dimension handling

## Future Enhancements

- Add Ollama provider for local models
- Add HuggingFace transformers provider
- Add caching layer for embeddings
- Add batch optimization

## Alternatives Considered

### OpenAI Only

- **Pros**: Simpler codebase, always high quality
- **Cons**: Requires API key, costs money, can't work offline
- **Decision**: Rejected - need fallback for development

### Deterministic Only

- **Pros**: No dependencies, free, fast
- **Cons**: Lower quality, less accurate search
- **Decision**: Rejected - need high quality for production

### No Abstraction

- **Pros**: Simpler, can use provider-specific features
- **Cons**: Hard to test, requires provider always
- **Decision**: Rejected - need abstraction for flexibility

## References

- [OpenAI Embeddings API](https://platform.openai.com/docs/guides/embeddings)
- [ADR-0016: Vector Store Abstraction](./0016-vector-store-abstraction.md)

---

**Last Updated:** 2025-11-18  
**Next Review:** 2026-02-18 (quarterly review)

