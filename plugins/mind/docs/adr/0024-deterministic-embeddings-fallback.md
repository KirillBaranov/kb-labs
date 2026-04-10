# ADR-0024: Deterministic Embeddings as Development Fallback

**Date:** 2025-11-18
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-18
**Tags:** [architecture, embeddings, development]

## Context

Mind v2 requires embeddings for semantic search, but:

- **API Dependencies**: OpenAI embeddings require API keys and internet
- **Development**: Developers need to work offline
- **Testing**: Tests need reproducible results
- **Cost**: API calls cost money

We need a fallback embedding solution that works without external dependencies.

## Decision

We will implement **deterministic embeddings** as a fallback provider:

1. **Hash-Based**: Uses cryptographic hash functions
2. **Deterministic**: Same input always produces same output
3. **Fixed Dimension**: 384 dimensions (compatible with common models)
4. **No Dependencies**: Works without external APIs

### Architecture

```typescript
export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  readonly dimension = 384;
  
  async embed(texts: string[]): Promise<EmbeddingVector[]> {
    return texts.map(text => this.generateDeterministicVector(text));
  }
  
  private generateDeterministicVector(text: string): EmbeddingVector {
    // Use hash to generate deterministic pseudo-random vector
    const hash = createHash('sha256').update(text).digest();
    const vector = new Array(384).fill(0);
    
    // Distribute hash bytes across vector dimensions
    for (let i = 0; i < hash.length; i++) {
      const idx = i % 384;
      vector[idx] = (vector[idx] + hash[i]!) / 256;
    }
    
    // Normalize to unit vector
    return this.normalize(vector);
  }
}
```

### Properties

- **Deterministic**: Same text → same vector
- **Fast**: No network calls, instant generation
- **Free**: No API costs
- **Offline**: Works without internet
- **Dimension**: 384 (compatible with many models)

## Rationale

### Why Deterministic Embeddings?

- **Development**: Works offline, no API keys needed
- **Testing**: Reproducible test results
- **Cost**: No API costs for development
- **Speed**: Instant generation, no network latency

### Why Hash-Based?

- **Deterministic**: Same input → same output
- **Fast**: Cryptographic hashes are fast
- **Simple**: Easy to implement and understand
- **Reliable**: No external dependencies

### Why 384 Dimensions?

- **Compatibility**: Matches common embedding models
- **Balance**: Good balance between quality and size
- **Standard**: Common dimension for smaller models
- **Storage**: Efficient storage size

## Consequences

### Positive

- **Offline Development**: Works without internet
- **Reproducible Tests**: Same results every time
- **No Costs**: Free for development
- **Fast**: Instant generation

### Negative

- **Lower Quality**: Less semantically accurate than real embeddings
- **Dimension Mismatch**: Different from OpenAI (1536)
- **Limited Use**: Not suitable for production semantic search
- **No Semantics**: Doesn't capture semantic relationships

### Mitigation Strategies

- **Auto-Fallback**: Only used when no API key available
- **Clear Warnings**: Log when using deterministic embeddings
- **Production**: Always use real embeddings in production
- **Documentation**: Clear about quality differences

## Implementation

### Auto-Detection

```typescript
export function createEmbeddingProvider(
  config: EmbeddingProviderConfig,
  runtime: EmbeddingRuntimeAdapter,
): EmbeddingProvider {
  if (config.type === 'auto') {
    const hasOpenAIKey = runtime.env.get('OPENAI_API_KEY');
    return hasOpenAIKey
      ? new OpenAIEmbeddingProvider({ ... })
      : new DeterministicEmbeddingProvider();
  }
  
  // Explicit selection
  if (config.type === 'deterministic') {
    return new DeterministicEmbeddingProvider();
  }
  
  // ...
}
```

### Usage

Deterministic embeddings are automatically used when:
- `type: 'auto'` and no `OPENAI_API_KEY` found
- `type: 'deterministic'` explicitly set
- Development/testing scenarios

## Testing Strategy

- Unit tests for deterministic generation
- Test determinism (same input → same output)
- Test dimension correctness
- Test normalization

## Future Enhancements

- Better pseudo-random distribution
- Local embedding models (Ollama)
- Caching layer
- Quality metrics

## Alternatives Considered

### No Fallback

- **Pros**: Simpler, always high quality
- **Cons**: Requires API key, can't work offline
- **Decision**: Rejected - need offline development

### Random Embeddings

- **Pros**: Simple implementation
- **Cons**: Not deterministic, poor quality
- **Decision**: Rejected - need determinism for tests

### Local Model

- **Pros**: Better quality than deterministic
- **Cons**: Requires model download, more complex
- **Decision**: Rejected - deterministic is sufficient for fallback

## References

- [ADR-0017: Embedding Provider Abstraction](./0017-embedding-provider-abstraction.md)
- [SHA-256 Hash Function](https://en.wikipedia.org/wiki/SHA-2)

---

**Last Updated:** 2025-11-18  
**Next Review:** 2026-02-18 (quarterly review)

