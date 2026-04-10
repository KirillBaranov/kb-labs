# @kb-labs/mind-orchestrator

**Agent query orchestration for KB Labs Mind system.**

The Mind Orchestrator coordinates complex multi-step queries with different execution strategies (instant, auto, thinking), providing intelligent decomposition, gathering, verification, and synthesis of RAG results.

## Features

- **🎯 Agent Query Modes** - Instant, auto, and thinking modes for different query complexities
- **🧩 Query Decomposition** - LLM-powered breakdown of complex queries into sub-queries
- **📦 Chunk Gathering** - Intelligent gathering and filtering of relevant chunks
- **✅ Completeness Checking** - Validates if results answer the query fully
- **🔄 Synthesis** - LLM-powered response generation from gathered chunks
- **🗜️ Compression** - Response optimization for token efficiency
- **🔍 Source Verification** - Anti-hallucination checks on sources
- **💾 Query Caching** - Cache results for repeated queries
- **📊 Analytics** - Track query performance and patterns

## Architecture

```
mind-orchestrator/
├── src/
│   ├── orchestrator.ts          # Main AgentQueryOrchestrator
│   ├── types.ts                 # Orchestrator types
│   │
│   ├── modes/                   # Query mode strategies
│   │   ├── instant-mode.ts      # Fast, no decomposition
│   │   ├── auto-mode.ts         # Complexity detection
│   │   └── thinking-mode.ts     # Deep analysis
│   │
│   ├── decomposer/              # Query decomposition
│   │   └── query-decomposer.ts  # LLM-powered decomposition
│   │
│   ├── gatherer/                # Chunk gathering
│   │   └── chunk-gatherer.ts    # Gather & filter chunks
│   │
│   ├── checker/                 # Completeness validation
│   │   └── completeness-checker.ts
│   │
│   ├── synthesizer/             # Response synthesis
│   │   └── response-synthesizer.ts
│   │
│   ├── compressor/              # Response compression
│   │   └── response-compressor.ts
│   │
│   ├── verification/            # Verification layer
│   │   ├── source-verifier.ts   # Source verification
│   │   └── field-checker.ts     # Field completeness
│   │
│   ├── cache/                   # Query caching
│   │   └── query-cache.ts
│   │
│   └── analytics/               # Analytics tracking
│       ├── mind-analytics.ts
│       └── types.ts
```

## Usage

### Creating Orchestrator

```typescript
import { AgentQueryOrchestrator } from '@kb-labs/mind-orchestrator';
import { usePlatform } from '@kb-labs/sdk';

const platform = usePlatform();
const orchestrator = new AgentQueryOrchestrator({
  llm: platform?.llm,
  analyticsAdapter: platform?.analytics,
});
```

### Query with Agent Modes

```typescript
// Instant mode - Fast, no decomposition (~30-40s, 1-2 LLM calls)
const instantResult = await orchestrator.query({
  text: 'What is VectorStore interface?',
  mode: 'instant',
  scope: 'default',
});

// Auto mode - Balanced, automatic complexity detection (~60s, 3-4 LLM calls)
const autoResult = await orchestrator.query({
  text: 'How does hybrid search work?',
  mode: 'auto',
  scope: 'default',
});

// Thinking mode - Deep analysis, multi-step reasoning (~60-90s, 4-5 LLM calls)
const thinkingResult = await orchestrator.query({
  text: 'Explain the anti-hallucination architecture end-to-end',
  mode: 'thinking',
  scope: 'default',
});
```

### Understanding Agent Response

```typescript
import type { AgentResponse } from '@kb-labs/sdk';

const response: AgentResponse = await orchestrator.query({
  text: 'How does authentication work?',
  mode: 'auto',
});

console.log('Answer:', response.answer);
console.log('Confidence:', response.confidence);
console.log('Sources:', response.sources.length);

// Check warnings (low confidence, missing chunks, etc.)
if (response.warnings && response.warnings.length > 0) {
  response.warnings.forEach(warning => {
    console.warn(`[${warning.code}] ${warning.message}`);
  });
}

// Debug information
if (response.debug) {
  console.log('LLM calls:', response.debug.llmCallCount);
  console.log('Tokens:', response.debug.totalTokens);
  console.log('Duration:', response.debug.durationMs, 'ms');
}
```

## Agent Query Modes

### Mode Selection Guide

| Mode | Use Case | Performance | LLM Calls | Tokens |

## Breaking changes (no legacy compatibility)

- `MindChunk`/`MindIntent` are canonical public types for orchestrator boundaries.
- Legacy `Knowledge*`-named public contracts are removed from `mind-*` package surfaces.
- Update integrations to consume `Mind` terminology and `profiles[].products.mind` config.
|------|----------|-------------|-----------|--------|
| **instant** | Simple lookups, known entities | ~30-40s | 1-2 | 500-1K |
| **auto** | General queries, let system decide | ~60s | 3-4 | 3-4K |
| **thinking** | Complex architecture, deep analysis | ~60-90s | 4-5 | 4-5K |

### instant Mode

**Best for:**
- "What is [ClassName]?"
- "Where is [feature] located?"
- Quick reference checks

**How it works:**
1. Search engine directly (no decomposition)
2. Single synthesis pass
3. Basic verification

**Example:**
```typescript
const result = await orchestrator.query({
  text: 'What is the MindEngine class?',
  mode: 'instant',
});
```

### auto Mode (Recommended)

**Best for:**
- Medium complexity questions
- Letting the system decide complexity
- Balanced performance/quality

**How it works:**
1. Query complexity detection
2. Adaptive decomposition (if needed)
3. Multi-chunk gathering
4. Completeness checking
5. Synthesis with verification

**Example:**
```typescript
const result = await orchestrator.query({
  text: 'How does Mind handle embeddings?',
  mode: 'auto', // System auto-selects strategy
});
```

### thinking Mode

**Best for:**
- Complex architectural questions
- Multi-step reasoning
- Deep analysis: "Explain how [system] works end-to-end"
- Comparing multiple implementations

**How it works:**
1. Deep query decomposition (3-5 sub-queries)
2. Exhaustive chunk gathering
3. Multi-pass completeness checking
4. Iterative synthesis
5. Full verification pipeline

**Example:**
```typescript
const result = await orchestrator.query({
  text: 'Explain the complete RAG pipeline from indexing to query response',
  mode: 'thinking',
});
```

## Key Concepts

### Query Decomposition

For complex queries, the orchestrator uses LLM to break them into sub-queries:

**Original query:**
```
"Explain how Mind handles authentication and authorization"
```

**Decomposed into:**
```
1. "What is the authentication mechanism in Mind?"
2. "How does Mind handle authorization?"
3. "What is the relationship between auth and authz?"
```

Each sub-query is executed, results gathered, and synthesized into final answer.

### Chunk Gathering

The gatherer collects chunks from search results with:

1. **Relevance filtering** - Remove low-confidence chunks (< 0.5)
2. **Deduplication** - Merge overlapping chunks
3. **Context expansion** - Include surrounding code for better understanding
4. **Token budget** - Respect LLM context limits (4K-8K tokens)

### Completeness Checking

Before synthesis, the checker validates:

- ✅ Query fully answered?
- ✅ All key concepts covered?
- ✅ Missing critical information?
- ✅ Need additional chunks?

If incomplete, orchestrator gathers more chunks or marks with warning.

### Response Synthesis

LLM-powered synthesis creates final answer:

1. **Context building** - Compile relevant chunks
2. **Instruction prompting** - Guide LLM to answer query
3. **Source attribution** - Link answer to source files
4. **Markdown formatting** - Clean, readable output

### Verification Pipeline

Anti-hallucination checks:

1. **Source verification** - Ensure all sources exist
2. **Field completeness** - Validate metadata
3. **Confidence scoring** - Calculate reliability
4. **Warning generation** - Alert on low confidence

**Reference**: [ADR-0031: Anti-Hallucination System](../../docs/adr/0031-anti-hallucination-system.md)

### Query Caching

Cache query results for performance:

```typescript
const orchestrator = new AgentQueryOrchestrator({
  engine,
  llm,
  cacheOptions: {
    enabled: true,
    ttl: 3600, // 1 hour
  },
});
```

**Cache key**: `hash(query.text + query.mode + query.scope)`

## Configuration

### Orchestrator Options

```typescript
interface OrchestratorOptions {
  engine: KnowledgeEngine;
  llm: ILLM;
  analyticsAdapter?: IAnalytics;
  cacheOptions?: {
    enabled: boolean;
    ttl: number; // seconds
  };
  tokenBudget?: {
    maxContextTokens: number; // Default: 8000
    maxResponseTokens: number; // Default: 2000
  };
  verification?: {
    enabled: boolean; // Default: true
    strictMode: boolean; // Default: false
  };
}
```

### Environment Variables

```bash
# LLM provider
export OPENAI_API_KEY=sk-...

# Analytics (optional)
export KB_ANALYTICS_ENABLED=true

# Cache (optional)
export KB_QUERY_CACHE_TTL=3600

# Log level
export KB_LOG_LEVEL=debug
```

## Performance

### Mode Performance Comparison

| Mode | Avg Duration | LLM Calls | Tokens | Cost (GPT-4) |
|------|--------------|-----------|--------|--------------|
| instant | 30-40s | 1-2 | 500-1K | ~$0.01 |
| auto | 60s | 3-4 | 3-4K | ~$0.03 |
| thinking | 60-90s | 4-5 | 4-5K | ~$0.04 |

### Optimization Tips

1. **Use instant for lookups** - "What is X?" queries don't need decomposition
2. **Enable caching** - Repeated queries return instantly
3. **Tune token budget** - Reduce maxContextTokens if hitting limits
4. **Parallelize sub-queries** - Orchestrator already does this automatically

## Dependencies

```json
{
  "dependencies": {
    "@kb-labs/sdk": "^1.0.0"
  }
}
```

**Note**: Mind Orchestrator uses **SDK-only imports** - no internal packages.

## Testing

```bash
# Run unit tests
pnpm test

# Run with coverage
pnpm test:coverage

# Integration tests
pnpm test:integration
```

## Development

### Build

```bash
pnpm build
```

### Watch Mode

```bash
pnpm dev
```

### Type Check

```bash
pnpm typecheck
```

## Architecture Decisions

Key ADRs affecting Mind Orchestrator:

- [ADR-0029: Agent Query Orchestration](../../docs/adr/0029-agent-query-orchestration.md)
- [ADR-0030: Query Decomposition](../../docs/adr/0030-query-decomposition.md)
- [ADR-0031: Anti-Hallucination System](../../docs/adr/0031-anti-hallucination-system.md)

## Related Packages

- **@kb-labs/mind-engine** - Core RAG engine (indexing, search, reasoning)
- **@kb-labs/mind-cli** - CLI commands with orchestrator integration

## Examples

### Complete Example with All Features

```typescript
import {
  AgentQueryOrchestrator,
} from '@kb-labs/mind-orchestrator';
import { usePlatform } from '@kb-labs/sdk';

// Setup
const platform = usePlatform();

const orchestrator = new AgentQueryOrchestrator({
  llm: platform?.llm,
  analyticsAdapter: platform?.analytics,
  cacheOptions: { enabled: true, ttl: 3600 },
  tokenBudget: { maxContextTokens: 8000, maxResponseTokens: 2000 },
  verification: { enabled: true, strictMode: false },
});

// Query
const response = await orchestrator.query({
  text: 'How does Mind implement hybrid search?',
  mode: 'auto',
  scope: 'default',
});

// Handle response
if (response.confidence >= 0.7) {
  console.log('✅ High confidence answer');
  console.log(response.answer);
} else {
  console.warn('⚠️ Low confidence, review sources manually');
}

// Show sources
response.sources.forEach(source => {
  console.log(`📄 ${source.path}:${source.range?.start.line}`);
});
```

## Contributing

### Code Quality Standards

- **Single responsibility** - Each module focused on one job
- **Strategy pattern** - Mode selection via strategy objects
- **Pipeline pattern** - Sequential orchestration steps
- **Type safety** - No `any` types
- **Test coverage** - Integration tests for all modes

### Before Committing

```bash
pnpm build
pnpm test
```

## License

Private - KB Labs internal use only.

## Support

For questions, check:
- [ADR-0029: Agent Query Orchestration](../../docs/adr/0029-agent-query-orchestration.md)
- [Mind Engine README](../mind-engine/README.md)
- [CLAUDE.md](../../CLAUDE.md) - Development guide

---

**Last Updated**: 2025-12-09
**Version**: 0.1.0
**Status**: 🟡 SDK Migration Pending (Phase 2)
