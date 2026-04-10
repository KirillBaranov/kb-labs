# ADR-0015: Search Result Compression for Token Optimization

**Date:** 2025-11-18
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-18
**Tags:** [architecture, optimization, search]

## Context

Mind v2 generates search results that are passed to LLMs as context. As the codebase grows and search results become more comprehensive, the token usage increases significantly, leading to:

- Higher API costs for LLM calls
- Context window limitations (most LLMs have token limits)
- Slower processing times
- Reduced ability to include more relevant chunks

We need a strategy to reduce token usage while preserving the semantic meaning and usefulness of search results. The compression should be:
- Configurable per project (different codebases have different needs)
- Transparent (users should understand what was compressed)
- Non-destructive (should not lose critical information)
- Measurable (should provide metrics on token savings)

## Decision

We will implement a **multi-layered compression system** with the following techniques:

1. **Smart Truncation** - Intelligent truncation that preserves code structure (function signatures, type definitions, exports)
2. **Metadata-Only Mode** - For low-score chunks, show only metadata instead of full content
3. **Incremental Context Building** - Build context incrementally with token budget awareness
4. **LLM Compression** - Placeholder for future LLM-based compression (not implemented yet)

### Architecture

The compression system is integrated into the `formatChunkForContext` function and applied during the query flow:

```typescript
interface CompressionOptions {
  enabled: boolean;
  cache: 'memory' | 'qdrant' | 'both';
  smartTruncation: {
    enabled: boolean;
    maxLength: number; // Default: 2000
    preserveStructure: boolean; // Default: true
  };
  metadataOnly: {
    enabled: boolean;
    scoreThreshold: number; // Default: 0.4
  };
  llm: {
    enabled: boolean; // Not implemented yet
    model?: string;
    maxTokens?: number;
  };
}
```

### Smart Truncation

When a chunk exceeds `maxLength`:
- Preserve first 30% of lines
- Extract important parts (function signatures, type definitions, exports)
- Preserve last 30% of lines
- Insert markers (`// ...`) between sections

Important parts are identified by keywords: `export`, `function`, `class`, `interface`, `type`, `const`, `let`, `var`, `enum`, `namespace`.

### Metadata-Only Mode

For chunks with `score < scoreThreshold`:
- Show only metadata: file path, function/class/type names, line numbers
- Extract brief description from comments if available
- Format: `[metadata-only] path/to/file.ts` with context information

### Cache Strategy

- **Memory Cache**: Per-query cache (`Map<chunkId, compressedText>`) - implemented
- **Qdrant Cache**: Persistent storage in Qdrant payload - reserved for future
- **Both**: Combination of both strategies - reserved for future

## Rationale

### Why Multi-Layered Approach?

- **Flexibility**: Different techniques work better for different scenarios
- **Gradual Degradation**: Can apply more aggressive compression when needed
- **Preservation**: Smart truncation preserves structure, metadata-only preserves references
- **Configurability**: Users can tune thresholds based on their codebase quality

### Why Configurable Thresholds?

- **Codebase Quality**: Different projects have different chunker quality and score distributions
- **Use Case**: Some projects need more context, others can work with less
- **Hotfix Capability**: Can adjust thresholds without code changes

### Why Start with Memory Cache?

- **Simplicity**: No schema changes needed
- **Debugging**: Easier to debug and test
- **No Migration**: No need to update existing indexes
- **Per-Query**: Ideal for per-query/per-session compression

## Consequences

### Positive

- **Token Savings**: 30-50% reduction in token usage
- **Cost Reduction**: Lower API costs for LLM calls
- **Better Context Management**: Can include more relevant chunks within token limits
- **Configurability**: Users can tune compression based on their needs
- **Transparency**: Metrics show exactly how much was saved
- **Non-Breaking**: Compression is opt-in via configuration

### Negative

- **Information Loss**: Truncation might lose some context
- **Metadata-Only Risk**: Low-score chunks might still be relevant
- **Complexity**: More configuration options to understand
- **Approximation**: Token estimation is approximate (~4 chars/token)

### Mitigation Strategies

- **Configurable Thresholds**: Users can adjust `scoreThreshold` based on their codebase
- **Structure Preservation**: Smart truncation preserves important code structure
- **Metrics**: Logging helps users understand compression effectiveness
- **Conservative Defaults**: Default `scoreThreshold` of 0.4 is conservative
- **Future LLM Compression**: Will provide better semantic compression

## Implementation

### Configuration

Compression is configured in `kb.config.json`:

```json
{
  "knowledge": {
    "engines": [{
      "options": {
        "search": {
          "optimization": {
            "compression": {
              "enabled": true,
              "cache": "memory",
              "smartTruncation": {
                "enabled": true,
                "maxLength": 2000,
                "preserveStructure": true
              },
              "metadataOnly": {
                "enabled": true,
                "scoreThreshold": 0.4
              },
              "llm": {
                "enabled": false
              }
            }
          }
        }
      }
    }]
  }
}
```

### Integration Points

1. **formatChunkForContext**: Applies compression based on chunk score and options
2. **MindKnowledgeEngine.query**: Formats chunks with compression and logs metrics
3. **ContextOptimizer**: Works with token budget for incremental building

### Metrics

Compression metrics are logged for each query:

```json
{
  "totalChunks": 10,
  "metadataOnlyChunks": 3,
  "tokensBeforeCompression": 5000,
  "tokensAfterCompression": 3500,
  "tokensSaved": 1500,
  "compressionRate": "30.0%"
}
```

## Testing Strategy

### Compression Effectiveness

- Measure token savings for different codebase sizes
- Verify that important information is preserved
- Test with different score distributions

### Configuration Validation

- Test with different `scoreThreshold` values
- Verify `maxLength` truncation works correctly
- Test cache behavior

### Edge Cases

- Empty chunks
- Very short chunks (< maxLength)
- Very long chunks (> maxLength * 2)
- Chunks with no important parts

## Future Enhancements

### LLM Compression

- Implement real LLM-based compression
- Use LLM to extract key information from chunks
- Generate concise summaries of complex code

### Qdrant Cache

- Store compressed versions in Qdrant payload
- Reuse compressed chunks across queries
- Update cache on index updates

### Adaptive Thresholds

- Learn optimal `scoreThreshold` from feedback
- Adjust thresholds based on query success rates
- Per-scope threshold optimization

## Alternatives Considered

### Simple Truncation Only

- **Pros**: Simple implementation
- **Cons**: Loses important information, no structure preservation
- **Decision**: Rejected - too simplistic

### LLM Compression Only

- **Pros**: Best semantic compression
- **Cons**: Requires API calls, slower, more expensive
- **Decision**: Rejected - need fast, local compression first

### Fixed Thresholds

- **Pros**: Simpler configuration
- **Cons**: Doesn't adapt to different codebases
- **Decision**: Rejected - configurability is important

### No Compression

- **Pros**: No information loss
- **Cons**: High token usage, cost, context limits
- **Decision**: Rejected - compression is necessary for scalability

## References

- [ADR-0011: Token Estimation Strategy](./0011-token-estimation-strategy.md)
- [Compression Documentation](../compression.md)
- [Mind v2 Architecture](../architecture.md)

---

**Last Updated:** 2025-11-18  
**Next Review:** 2026-02-18 (quarterly review)

