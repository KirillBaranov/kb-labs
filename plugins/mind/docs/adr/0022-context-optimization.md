# ADR-0022: Context Optimization for Quality Results

**Date:** 2025-11-18
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-18
**Tags:** [architecture, optimization, search-quality]

## Context

Raw search results often have quality issues:

- **Duplicates**: Same or very similar chunks appear multiple times
- **Low Diversity**: Too many chunks from same file
- **Token Budget**: Need to fit within LLM context limits
- **Relevance**: Some chunks are more relevant than others

We need a system to optimize search results before presenting them to the LLM.

## Decision

We will implement **context optimization** with multiple techniques:

1. **Deduplication**: Remove duplicate or highly similar chunks
2. **Diversification**: Ensure variety across files and topics
3. **Adaptive Selection**: Select chunks based on token budget
4. **Max Chunks Per File**: Limit chunks from single file

### Architecture

```typescript
export class ContextOptimizer {
  optimize(
    matches: VectorSearchMatch[],
    options: ContextOptimizationOptions,
  ): KnowledgeChunk[] {
    let chunks = this.convertToChunks(matches);
    
    // Step 1: Deduplication
    if (options.deduplication) {
      chunks = this.deduplicate(chunks, options.deduplicationThreshold);
    }
    
    // Step 2: Diversification
    if (options.diversification) {
      chunks = this.diversify(chunks, options.diversityThreshold, options.maxChunksPerFile);
    }
    
    // Step 3: Adaptive selection
    if (options.adaptiveSelection && options.tokenBudget) {
      chunks = this.adaptiveSelect(chunks, options.tokenBudget, options.avgTokensPerChunk);
    }
    
    // Step 4: Top-K selection
    return this.selectTopK(chunks, options.maxChunks);
  }
}
```

### Techniques

1. **Deduplication**
   - Similarity threshold: 0.9 (default)
   - Text-based similarity calculation
   - Keeps highest-scoring duplicate

2. **Diversification**
   - Diversity threshold: 0.3 (default)
   - Ensures chunks from different files
   - Limits chunks per file (default: 3)

3. **Adaptive Selection**
   - Token budget awareness
   - Estimates tokens per chunk (~4 chars/token)
   - Stops when budget reached

4. **Max Chunks Per File**
   - Prevents over-representation
   - Default: 3 chunks per file
   - Ensures diversity

## Rationale

### Why Multiple Techniques?

- **Comprehensive**: Addresses multiple quality issues
- **Modular**: Can enable/disable independently
- **Composable**: Techniques work together
- **Configurable**: Can tune for different use cases

### Why Deduplication?

- **Quality**: Removes redundant information
- **Token Savings**: Saves tokens for more diverse content
- **Clarity**: Cleaner results for LLM

### Why Diversification?

- **Coverage**: Ensures broader codebase coverage
- **Balance**: Prevents single-file dominance
- **Quality**: More diverse context improves LLM understanding

### Why Adaptive Selection?

- **Token Budget**: Respects LLM context limits
- **Efficiency**: Maximizes information within budget
- **Flexibility**: Adapts to different budget sizes

## Consequences

### Positive

- **Better Quality**: Removes duplicates, ensures diversity
- **Token Efficiency**: Fits within budget constraints
- **Configurability**: Can tune for different scenarios
- **Modularity**: Can enable/disable techniques

### Negative

- **Complexity**: More moving parts
- **Configuration**: Need to understand options
- **Performance**: Additional processing overhead
- **Potential Loss**: Might remove relevant chunks

### Mitigation Strategies

- **Sensible Defaults**: Works well out of the box
- **Optional**: Can disable if not needed
- **Tunable**: Can adjust thresholds
- **Transparent**: Logs what was removed

## Implementation

### Configuration

```json
{
  "knowledge": {
    "engines": [{
      "options": {
        "search": {
          "optimization": {
            "deduplication": true,
            "deduplicationThreshold": 0.9,
            "diversification": true,
            "diversityThreshold": 0.3,
            "maxChunksPerFile": 3,
            "adaptiveSelection": false,
            "avgTokensPerChunk": 200
          }
        }
      }
    }]
  }
}
```

### Similarity Calculation

```typescript
function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size; // Jaccard similarity
}
```

## Testing Strategy

- Unit tests for each technique
- Integration tests for combined optimization
- Test with various chunk distributions
- Test token budget handling

## Future Enhancements

- Embedding-based similarity (more accurate)
- Semantic diversity (beyond file diversity)
- Learning-based selection
- Quality scoring

## Alternatives Considered

### No Optimization

- **Pros**: Simple, no processing overhead
- **Cons**: Lower quality, duplicates, token waste
- **Decision**: Rejected - need quality improvements

### Single Technique

- **Pros**: Simpler implementation
- **Cons**: Less effective, doesn't address all issues
- **Decision**: Rejected - need comprehensive optimization

### External Service

- **Pros**: More sophisticated algorithms
- **Cons**: External dependency, latency, cost
- **Decision**: Rejected - want self-contained solution

## References

- [ADR-0015: Search Result Compression](./0015-search-result-compression.md)
- [Jaccard Similarity](https://en.wikipedia.org/wiki/Jaccard_index)

---

**Last Updated:** 2025-11-18  
**Next Review:** 2026-02-18 (quarterly review)

