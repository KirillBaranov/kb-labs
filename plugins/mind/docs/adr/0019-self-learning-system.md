# ADR-0019: Self-Learning System for Continuous Improvement

**Date:** 2025-11-18
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-18
**Tags:** [architecture, learning, optimization]

## Context

Search quality in Mind v2 depends on multiple factors:

- **Query Patterns**: Users often search for similar things
- **Result Relevance**: Some chunks are more useful than others
- **Hybrid Search Weights**: Optimal weights vary by query type
- **Popular Content**: Frequently accessed chunks should rank higher

We need a system that learns from usage patterns to continuously improve search quality without manual tuning.

## Decision

We will implement a **self-learning system** with multiple components:

1. **Query History**: Store past queries and their results
2. **Feedback Collection**: Gather implicit and explicit feedback
3. **Popularity Boost**: Boost frequently used chunks
4. **Query Pattern Learning**: Identify successful query-result patterns
5. **Adaptive Weights**: Dynamically adjust hybrid search weights

### Architecture

```typescript
interface LearningComponents {
  queryHistory: QueryHistoryStore;
  feedbackStore: FeedbackStore;
  popularityBoost: PopularityBoost;
  queryPatternMatcher: QueryPatternMatcher;
  adaptiveWeights: AdaptiveWeights;
}

// In query flow:
// 1. Save query history
await queryHistory.save({
  queryId, queryText, queryVector, resultChunkIds, topChunkIds
});

// 2. Apply popularity boost
matches = await applyPopularityBoost(matches);

// 3. Apply query pattern boost
matches = await applyQueryPatternBoost(matches, queryText);

// 4. Get adaptive weights
const weights = await adaptiveWeights.getWeights(queryText, queryVector);
```

### Components

1. **QueryHistoryStore**: Stores query history
   - Qdrant-backed for persistence
   - Memory-backed for testing
   - Stores query text, vector, results, timestamps

2. **FeedbackStore**: Collects feedback on result relevance
   - Implicit: Agent usage patterns
   - Self-feedback: LLM-generated relevance scores
   - Explicit: User-provided (future)

3. **PopularityBoost**: Boosts frequently used chunks
   - Logarithmic boost based on usage count
   - Minimum threshold (3 uses) before boosting
   - Cached for performance

4. **QueryPatternMatcher**: Learns successful patterns
   - Finds similar past queries
   - Boosts chunks from successful past results
   - Uses vector similarity for query matching

5. **AdaptiveWeights**: Adjusts hybrid search weights
   - Analyzes feedback to determine optimal weights
   - Adapts based on query type
   - Requires sufficient feedback data

## Rationale

### Why Self-Learning?

- **Continuous Improvement**: Gets better over time
- **No Manual Tuning**: Adapts automatically
- **Personalization**: Learns project-specific patterns
- **Scalability**: Works for any codebase size

### Why Multiple Components?

- **Modular**: Can enable/disable components independently
- **Focused**: Each component addresses specific problem
- **Composable**: Components work together synergistically
- **Testable**: Can test each component separately

### Why Qdrant Storage?

- **Persistence**: Data survives restarts
- **Scalability**: Handles large amounts of data
- **Querying**: Can query similar queries efficiently
- **Integration**: Already using Qdrant for vectors

## Consequences

### Positive

- **Better Search Quality**: Improves over time
- **Reduced Manual Tuning**: Adapts automatically
- **Personalization**: Learns project-specific patterns
- **Scalability**: Works for any codebase
- **Transparency**: Can inspect learning data

### Negative

- **Complexity**: More moving parts
- **Storage Overhead**: Requires storage for learning data
- **Cold Start**: Needs data before learning kicks in
- **Configuration**: Multiple options to understand

### Mitigation Strategies

- **Opt-In**: Disabled by default, can enable gradually
- **Sensible Defaults**: Works well with default settings
- **Storage Options**: Can use memory for testing
- **Clear Documentation**: Document each component

## Implementation

### Configuration

```json
{
  "knowledge": {
    "engines": [{
      "options": {
        "learning": {
          "enabled": true,
          "queryHistory": true,
          "feedback": true,
          "popularityBoost": true,
          "queryPatterns": true,
          "adaptiveWeights": false,
          "storage": "auto"
        }
      }
    }]
  }
}
```

### Storage Strategy

- **Auto**: Uses Qdrant if available, otherwise memory
- **Qdrant**: Persistent storage in Qdrant
- **Memory**: In-memory (data lost on restart)

### Feedback Collection

1. **Implicit Feedback**: Agent records chunk usage
2. **Self-Feedback**: LLM evaluates top chunks
3. **Explicit Feedback**: User-provided (future)

## Testing Strategy

- Unit tests for each component
- Integration tests for learning flow
- Test with synthetic feedback data
- Test storage backends (Qdrant vs memory)

## Future Enhancements

- User-provided explicit feedback
- A/B testing framework
- Learning visualization dashboard
- Export/import learning data

## Alternatives Considered

### No Learning

- **Pros**: Simpler, no storage overhead
- **Cons**: Static, requires manual tuning
- **Decision**: Rejected - need continuous improvement

### Single Learning Component

- **Pros**: Simpler implementation
- **Cons**: Less effective, less flexible
- **Decision**: Rejected - multiple components more effective

### External ML Service

- **Pros**: More sophisticated learning
- **Cons**: External dependency, complexity, cost
- **Decision**: Rejected - want self-contained system

## References

- [ADR-0018: Hybrid Search with RRF](./0018-hybrid-search-rrf.md)
- [Self-Learning Documentation](../self-learning.md)

---

**Last Updated:** 2025-11-18  
**Next Review:** 2026-02-18 (quarterly review)

