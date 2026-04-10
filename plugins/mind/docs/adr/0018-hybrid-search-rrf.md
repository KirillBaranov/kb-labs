# ADR-0018: Hybrid Search with Reciprocal Rank Fusion

**Date:** 2025-11-18
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-18
**Tags:** [architecture, search, algorithm]

## Context

Semantic search using vector embeddings has limitations:

- **Vector Search**: Great for semantic similarity but misses exact matches
- **Keyword Search**: Great for exact matches but misses semantic relationships
- **Single Method**: Using only one method reduces recall

We need a strategy that combines the strengths of both approaches to improve search quality.

## Decision

We will implement **hybrid search** combining vector and keyword search using **Reciprocal Rank Fusion (RRF)**:

1. **Parallel Execution**: Run both searches simultaneously
2. **RRF Scoring**: Combine results using RRF algorithm
3. **Configurable Weights**: Allow tuning vector vs keyword importance
4. **BM25 Keyword Search**: Use BM25 algorithm for keyword matching

### Architecture

```typescript
export async function hybridSearch(
  vectorSearch: (scopeId, vector, limit, filters) => Promise<VectorSearchMatch[]>,
  keywordSearch: (chunks, query, limit, filters) => VectorSearchMatch[],
  scopeId: string,
  queryVector: EmbeddingVector,
  queryText: string,
  allChunks: StoredMindChunk[],
  limit: number,
  filters?: VectorSearchFilters,
  options: HybridSearchOptions = {},
): Promise<VectorSearchMatch[]> {
  // Run both searches in parallel
  const [vectorResults, keywordResults] = await Promise.all([
    vectorSearch(scopeId, queryVector, candidateLimit, filters),
    keywordSearch(allChunks, queryText, candidateLimit, filters),
  ]);
  
  // Combine using RRF
  const combined = combineWithRRF(vectorResults, keywordResults, options);
  
  return combined.slice(0, limit);
}
```

### RRF Algorithm

Reciprocal Rank Fusion combines ranked lists:

```
RRF_score(d) = Σ 1 / (k + rank_i(d))
```

Where:
- `d` is a document/chunk
- `rank_i(d)` is the rank of document in list i
- `k` is a constant (default: 60)

### Configuration

```typescript
interface HybridSearchOptions {
  vectorWeight?: number;    // Default: 0.7
  keywordWeight?: number;   // Default: 0.3
  rrfK?: number;            // Default: 60
}
```

## Rationale

### Why Hybrid Search?

- **Better Recall**: Combines semantic and exact matching
- **Flexibility**: Can tune weights based on use case
- **Proven Algorithm**: RRF is well-established in information retrieval
- **Parallel Execution**: No performance penalty

### Why RRF?

- **Rank-Aware**: Considers position in results, not just scores
- **No Normalization**: Works with different score ranges
- **Simple**: Easy to understand and implement
- **Effective**: Proven to improve search quality

### Why BM25 for Keyword Search?

- **Industry Standard**: Widely used in search engines
- **Term Frequency**: Considers term frequency and document length
- **Inverse Document Frequency**: Penalizes common terms
- **No Dependencies**: Can implement without external libraries

## Consequences

### Positive

- **Better Search Quality**: Combines strengths of both methods
- **Flexibility**: Configurable weights for different scenarios
- **Performance**: Parallel execution, minimal overhead
- **Proven Algorithm**: RRF is well-established

### Negative

- **Complexity**: More complex than single-method search
- **Configuration**: Need to tune weights
- **Resource Usage**: Requires all chunks for keyword search
- **Keyword Search Overhead**: BM25 calculation for all chunks

### Mitigation Strategies

- **Sensible Defaults**: 0.7 vector, 0.3 keyword works well
- **Caching**: Cache keyword search results when possible
- **Adaptive Weights**: Self-learning can tune weights automatically
- **Optional**: Can disable hybrid search if not needed

## Implementation

### Configuration

```json
{
  "knowledge": {
    "engines": [{
      "options": {
        "search": {
          "hybrid": true,
          "vectorWeight": 0.7,
          "keywordWeight": 0.3,
          "rrfK": 60
        }
      }
    }]
  }
}
```

### Performance Considerations

- Run searches in parallel
- Fetch more candidates than needed (limit * 2)
- RRF calculation is O(n) where n is candidate count
- Keyword search requires all chunks (can be optimized with indexing)

## Testing Strategy

- Unit tests for RRF algorithm
- Integration tests for hybrid search
- Test with different weight configurations
- Test with edge cases (empty results, single result)

## Future Enhancements

- Add keyword search indexing for better performance
- Adaptive weights based on query type
- Query expansion for keyword search
- Phrase matching improvements

## Alternatives Considered

### Vector Search Only

- **Pros**: Simpler, faster, no keyword search overhead
- **Cons**: Misses exact matches, lower recall
- **Decision**: Rejected - need better recall

### Keyword Search Only

- **Pros**: Simple, fast, great for exact matches
- **Cons**: Misses semantic relationships, lower recall
- **Decision**: Rejected - need semantic understanding

### Weighted Score Combination

- **Pros**: Simpler than RRF
- **Cons**: Requires score normalization, less effective
- **Decision**: Rejected - RRF is more effective

### Learning-to-Rank

- **Pros**: Can learn optimal combination
- **Cons**: Requires training data, more complex
- **Decision**: Rejected - RRF is simpler and effective

## References

- [Reciprocal Rank Fusion Paper](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf)
- [BM25 Algorithm](https://en.wikipedia.org/wiki/Okapi_BM25)
- [ADR-0019: Self-Learning System](./0019-self-learning-system.md)

---

**Last Updated:** 2025-11-18  
**Next Review:** 2026-02-18 (quarterly review)

