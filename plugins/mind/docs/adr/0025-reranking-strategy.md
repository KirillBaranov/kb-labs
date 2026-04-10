# ADR-0025: Reranking Strategy for Search Quality

**Date:** 2025-11-18
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-18
**Tags:** [architecture, search, ranking]

## Context

Initial search results from vector/keyword search may not be optimally ranked:

- **Score Limitations**: Vector similarity scores don't always reflect relevance
- **Query Understanding**: Need better understanding of query intent
- **Context Awareness**: Should consider query context for ranking
- **Quality Improvement**: Can improve search quality significantly

We need a reranking strategy that improves result quality without major performance impact.

## Decision

We will implement a **pluggable reranking system** with multiple strategies:

1. **Cross-Encoder Reranker**: LLM-based reranking for high quality
2. **Heuristic Reranker**: Rule-based reranking for speed
3. **No Reranking**: Skip reranking for performance
4. **Configurable**: Can enable/disable and configure

### Architecture

```typescript
export interface Reranker {
  rerank(
    query: string,
    matches: VectorSearchMatch[],
    options: RerankingOptions,
  ): Promise<VectorSearchMatch[]>;
}

export function createReranker(
  config: RerankerConfig,
  runtime: RuntimeAdapter,
): Reranker {
  switch (config.type) {
    case 'cross-encoder':
      return new CrossEncoderReranker(config.crossEncoder, runtime);
    case 'heuristic':
      return new HeuristicReranker();
    case 'none':
    default:
      return new NoOpReranker();
  }
}
```

### Strategies

1. **Cross-Encoder Reranker**
   - Uses LLM to score query-chunk pairs
   - High quality, understands semantics
   - Slower, requires API calls
   - Configurable model and batch size

2. **Heuristic Reranker**
   - Rule-based scoring
   - Fast, no external dependencies
   - Lower quality than cross-encoder
   - Based on keyword matches, position, etc.

3. **No Reranking**
   - Returns results as-is
   - Fastest option
   - No quality improvement
   - Default for most cases

## Rationale

### Why Reranking?

- **Quality Improvement**: Can significantly improve search quality
- **Query Understanding**: Better understanding of query intent
- **Flexibility**: Can use different strategies for different scenarios

### Why Pluggable?

- **Flexibility**: Can choose strategy based on needs
- **Performance**: Can disable for performance-critical scenarios
- **Extensibility**: Easy to add new strategies
- **Testing**: Can use simple strategies for tests

### Why Cross-Encoder?

- **Quality**: Best quality improvement
- **Semantic Understanding**: Understands query-chunk relationships
- **Proven**: Well-established technique in information retrieval

### Why Heuristic Fallback?

- **Speed**: Fast, no API calls
- **Offline**: Works without external APIs
- **Baseline**: Provides some improvement over no reranking

## Consequences

### Positive

- **Quality Improvement**: Better search results
- **Flexibility**: Can choose strategy
- **Performance Control**: Can disable if needed
- **Extensibility**: Easy to add new strategies

### Negative

- **Complexity**: More moving parts
- **Performance**: Cross-encoder adds latency
- **Cost**: Cross-encoder requires API calls
- **Configuration**: Need to understand options

### Mitigation Strategies

- **Optional**: Disabled by default
- **Fast Default**: Heuristic is fast
- **Configurable**: Can tune for different scenarios
- **Clear Documentation**: Document trade-offs

## Implementation

### Configuration

```json
{
  "knowledge": {
    "engines": [{
      "options": {
        "search": {
          "reranking": {
            "type": "none",
            "topK": 20,
            "minScore": 0,
            "crossEncoder": {
              "endpoint": "https://api.openai.com/v1/chat/completions",
              "model": "gpt-4o-mini",
              "batchSize": 10
            }
          }
        }
      }
    }]
  }
}
```

### Cross-Encoder Implementation

```typescript
class CrossEncoderReranker implements Reranker {
  async rerank(query: string, matches: VectorSearchMatch[], options: RerankingOptions): Promise<VectorSearchMatch[]> {
    // Score query-chunk pairs
    const scores = await Promise.all(
      matches.map(match => this.scorePair(query, match.chunk.text))
    );
    
    // Combine with original scores
    const reranked = matches.map((match, i) => ({
      ...match,
      score: (match.score + scores[i]!) / 2, // Average
    }));
    
    // Sort and filter
    return reranked
      .sort((a, b) => b.score - a.score)
      .filter(m => m.score >= options.minScore)
      .slice(0, options.topK);
  }
}
```

## Testing Strategy

- Unit tests for each reranker
- Integration tests for reranking flow
- Test with various query types
- Performance tests for cross-encoder

## Future Enhancements

- Local cross-encoder models
- Learning-to-rank
- Query-specific reranking
- Caching reranking results

## Alternatives Considered

### No Reranking

- **Pros**: Simple, fast
- **Cons**: Lower quality, misses improvements
- **Decision**: Rejected - need quality improvements

### Always Cross-Encoder

- **Pros**: Best quality
- **Cons**: Slow, expensive, requires API
- **Decision**: Rejected - need flexibility

### Single Strategy

- **Pros**: Simpler implementation
- **Cons**: Less flexible, can't optimize
- **Decision**: Rejected - need multiple strategies

## References

- [Cross-Encoder Reranking](https://www.sbert.net/examples/applications/cross-encoder/README.html)
- [ADR-0018: Hybrid Search with RRF](./0018-hybrid-search-rrf.md)

---

**Last Updated:** 2025-11-18  
**Next Review:** 2026-02-18 (quarterly review)

