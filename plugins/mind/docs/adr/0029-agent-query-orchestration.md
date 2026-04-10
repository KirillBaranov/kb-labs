# ADR-0029: Agent Query Orchestration

**Date:** 2025-11-26
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-26
**Tags:** rag, agent, orchestration, llm

## Context

The existing RAG query system (`mind-engine`) provides semantic search with hybrid ranking, but its output format is optimized for human-readable context generation. AI agents (Claude Code, Cursor, etc.) require:

1. **Structured JSON responses** - Machine-parseable format with explicit fields
2. **Confidence signals** - Numeric scores for decision-making
3. **Source attribution** - Clear file paths and code snippets
4. **Completeness indicators** - Whether the answer fully addresses the query
5. **Multi-step reasoning** - Complex queries need decomposition

Alternatives considered:
- **Post-processing existing output**: Fragile, loses semantic information
- **Adding flags to mind-engine**: Pollutes core search with agent-specific logic
- **External wrapper service**: Network overhead, deployment complexity

## Decision

Create a dedicated `@kb-labs/mind-orchestrator` package that wraps `mind-engine` and provides agent-optimized query orchestration.

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  AgentQueryOrchestrator                 │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │    Query     │  │    Chunk     │  │ Completeness │  │
│  │  Decomposer  │──│   Gatherer   │──│   Checker    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│          │                │                  │          │
│          ▼                ▼                  ▼          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Response   │  │   Response   │  │   Analytics  │  │
│  │  Synthesizer │──│  Compressor  │──│   Tracker    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │     mind-engine       │
              │  (Vector Search, RRF) │
              └───────────────────────┘
```

### Query Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| `instant` | Single-shot retrieval, no LLM | Fast lookups, simple queries |
| `auto` | Iterative with completeness checks | Default for most queries |
| `thinking` | Full decomposition, multi-iteration | Complex architectural questions |

### Response Schema

```typescript
interface AgentResponse {
  answer: string;
  sources: Array<{
    file: string;
    snippet: string;
    relevance: number;
  }>;
  confidence: number;    // 0-1 scale
  complete: boolean;     // Fully answered?
  meta: {
    schemaVersion: 'agent-response-v1';
    requestId: string;
    mode: AgentQueryMode;
    timingMs: number;
    cached: boolean;
    llmCalls: number;
    tokensIn: number;
    tokensOut: number;
  };
}
```

### Pipeline Components

1. **QueryDecomposer** - Breaks complex queries into focused sub-queries using LLM
2. **ChunkGatherer** - Retrieves and deduplicates chunks across sub-queries
3. **CompletenessChecker** - Assesses if gathered context sufficiently answers the query
4. **ResponseSynthesizer** - Generates natural language answer from chunks
5. **ResponseCompressor** - Reduces response size while preserving key information

### LLM Provider Abstraction

```typescript
interface LLMProvider {
  complete(prompt: string, options?: LLMOptions): Promise<LLMResponse>;
  estimateTokens(text: string): number;
}
```

Default implementation uses OpenAI `gpt-4o-mini` for cost efficiency.

## Consequences

### Positive

- **Clean separation**: Agent logic isolated from core search
- **Flexible modes**: Instant for speed, thinking for depth
- **Observable**: Built-in metrics for debugging and optimization
- **Testable**: Each component can be unit tested independently
- **Extensible**: Easy to add new modes or components

### Negative

- **LLM dependency**: Non-instant modes require API access
- **Latency**: Multi-step modes add 2-5 seconds
- **Cost**: LLM calls have associated costs (~$0.001-0.01 per query)

### Alternatives Considered

1. **Prompt-only approach**: Use LLM to interpret raw search results
   - Rejected: High token cost, inconsistent format

2. **Fine-tuned model**: Train model on codebase-specific queries
   - Rejected: Maintenance burden, cold-start problem

3. **Rule-based extraction**: Regex/AST-based answer extraction
   - Rejected: Brittle, poor generalization

## Implementation

### Package Structure

```
mind-orchestrator/
├── src/
│   ├── orchestrator.ts      # Main AgentQueryOrchestrator
│   ├── types.ts             # AgentResponse, AgentQueryMode
│   ├── components/
│   │   ├── decomposer.ts    # QueryDecomposer
│   │   ├── gatherer.ts      # ChunkGatherer
│   │   ├── checker.ts       # CompletenessChecker
│   │   ├── synthesizer.ts   # ResponseSynthesizer
│   │   └── compressor.ts    # ResponseCompressor
│   ├── llm/
│   │   ├── provider.ts      # LLMProvider interface
│   │   └── openai.ts        # OpenAI implementation
│   └── analytics/
│       ├── types.ts         # Event payloads
│       └── mind-analytics.ts # Analytics wrapper
└── package.json
```

### CLI Integration

```bash
# Agent mode flag
pnpm kb mind:rag-query --agent --text "how does X work"

# With mode selection
pnpm kb mind:rag-query --agent --mode thinking --text "explain architecture"

# Debug output
pnpm kb mind:rag-query --agent --debug --text "find rate limiting"
```

## References

- [ADR-0018: Hybrid Search with RRF](./0018-hybrid-search-rrf.md)
- [ADR-0022: Context Optimization](./0022-context-optimization.md)
- [knowledge-contracts AgentResponse types](../../packages/knowledge-contracts/src/agent-response.ts)

---

**Last Updated:** 2024-11-26
