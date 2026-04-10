# @kb-labs/mind-engine

**Core RAG (Retrieval-Augmented Generation) engine for KB Labs Mind system.**

The Mind Engine is the heart of KB Labs' semantic code search, providing intelligent indexing, hybrid search, reasoning capabilities, and self-learning systems for codebase understanding.

## Features

- **🔍 Hybrid Search** - Combines BM25 keyword search with vector similarity using RRF (Reciprocal Rank Fusion)
- **🧮 Semantic Embeddings** - OpenAI embeddings with deterministic fallback for development
- **💾 Vector Storage** - Qdrant integration with in-memory fallback
- **🧠 Reasoning Engine** - Query classification and intent detection
- **📈 Self-Learning** - Query history and feedback loop for continuous improvement
- **✅ Anti-Hallucination** - Source verification and confidence scoring
- **⚡ Incremental Indexing** - Delta indexing for fast updates

## Architecture

```
mind-engine/
├── src/
│   ├── index.ts                 # Main exports (MindEngine)
│   ├── indexing/                # Indexing pipeline
│   │   ├── pipeline.ts          # Main indexing orchestration
│   │   ├── chunking/            # AST & sliding window chunking
│   │   ├── embedding/           # Embedding generation
│   │   └── delta-indexer.ts    # Incremental indexing
│   ├── search/                  # Search coordination
│   │   ├── hybrid-search.ts     # BM25 + vector search
│   │   └── relevance-ranker.ts  # RRF ranking
│   ├── reasoning/               # Reasoning engine
│   │   ├── query-classifier.ts  # Classify query complexity
│   │   └── intent-detector.ts   # Detect user intent
│   ├── learning/                # Self-learning system
│   │   ├── query-history.ts     # Query history store
│   │   ├── file-history-store.ts # File rotation store
│   │   └── feedback-loop.ts     # Learning feedback
│   └── verification/            # Anti-hallucination
│       ├── source-verifier.ts   # Source verification
│       └── confidence-scorer.ts # Confidence scoring
```

## Usage

### Creating Engine Instance

```typescript
import { MindEngine } from '@kb-labs/mind-engine';

const engine = new MindEngine(
  { id: 'mind-default', type: 'mind', options: {} },
  { workspaceRoot: process.cwd() },
);

await engine.init();
```

### Indexing Code

```typescript
import type { MindSource } from '@kb-labs/mind-types';

const sources: MindSource[] = [
  {
    id: 'src/auth.ts',
    kind: 'code',
    path: 'src/auth.ts',
    content: '// code content',
    metadata: {
      language: 'typescript',
      repository: 'my-project',
    },
  },
];

await engine.index(sources as any, {
  scope: 'default',
  incremental: true,
});
```

### Querying

```typescript
import type { MindQuery } from '@kb-labs/mind-types';

const query: MindQuery = {
  text: 'How does authentication work?',
  intent: 'concept',
  scope: 'default',
  limit: 10,
};

const result = await engine.query(query as any, {
  scope: { id: 'default' },
  sources: sources as any,
  workspaceRoot: process.cwd(),
});

console.log('Found', result.chunks.length, 'relevant chunks');
result.chunks.forEach(chunk => {
  console.log(`[${chunk.confidence}] ${chunk.source.path}`);
});
```

## Key Concepts

### Hybrid Search

Mind Engine combines two search approaches:

1. **BM25 (Best Matching 25)** - Keyword-based search using TF-IDF
2. **Vector Similarity** - Semantic search using embeddings

Results are merged using **RRF (Reciprocal Rank Fusion)** with adaptive weights:

- **Lookup queries** (e.g., "What is X?"): 70% vector, 30% BM25
- **Concept queries** (e.g., "How does X work?"): 70% vector, 30% BM25
- **Architecture queries** (e.g., "Explain X architecture"): 60% vector, 40% BM25

**Reference**: [ADR-0033: Adaptive Search Weights](../../docs/adr/0033-adaptive-search-weights-by-intent.md)

## Breaking changes (no legacy compatibility)

- `MindKnowledgeEngine` removed; use `MindEngine`.
- `registerMindKnowledgeEngine` removed; use `registerMindEngine`.
- Legacy config paths `knowledge.json` and top-level `knowledge` are not supported.

### Chunking Strategy

Code is chunked using two strategies:

1. **AST-based chunking** - Respects code structure (functions, classes, blocks)
2. **Sliding window chunking** - For non-code or when AST fails

**Chunk size**: 200-500 tokens with 50-token overlap

### Anti-Hallucination

Mind Engine includes verification layers to prevent false information:

1. **Source verification** - Ensures chunks exist in actual files
2. **Confidence scoring** - Calculates reliability scores (0-1)
3. **Field completeness** - Validates required metadata

**Confidence thresholds**:
- Low: < 0.5 (uncertain)
- Medium: 0.5-0.7 (acceptable)
- High: ≥ 0.7 (reliable)

**Reference**: [ADR-0031: Anti-Hallucination System](../../docs/adr/0031-anti-hallucination-system.md)

### Self-Learning

Mind Engine learns from usage patterns:

- **Query history** - Tracks successful queries and results
- **Feedback loop** - Improves ranking based on user interactions
- **File rotation** - Auto-manages log size with configurable retention

## Performance

### Benchmarks (2025-11-26)

| Query Type | Confidence | Status |
|------------|------------|--------|
| EASY (lookup) | 0.63 | ✅ PASS |
| MEDIUM (concept) | 0.78 | ✅ PASS |
| HARD (architecture) | 0.70 | ✅ PASS |
| **Average** | **0.70** | **7.0/10** |

Run benchmarks:
```bash
./scripts/run-benchmarks.sh
```

**Reference**: [BENCHMARKS.md](./BENCHMARKS.md)

## Configuration

### Environment Variables

```bash
# OpenAI API key for embeddings (optional - falls back to deterministic)
export OPENAI_API_KEY=sk-...

# Qdrant URL for remote vector store (optional - uses local by default)
export QDRANT_URL=http://localhost:6333

# Log level
export KB_LOG_LEVEL=debug
```

### Config File

Location: `.kb/kb.config.json`

```json
{
  "scopes": [
    {
      "id": "default",
      "include": ["**/*.ts", "**/*.tsx", "**/*.md"],
      "exclude": ["**/node_modules/**", "**/dist/**"],
      "indexPath": ".kb/mind/index/default"
    }
  ]
}
```

## Dependencies

```json
{
  "dependencies": {
    "@kb-labs/sdk": "^1.0.0"
  }
}
```

**Note**: Mind Engine uses **SDK-only imports** - no internal packages (`@kb-labs/core-*`, `@kb-labs/knowledge-*`). This ensures proper singleton management and clean architecture.

## Testing

```bash
# Run unit tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run benchmarks
./scripts/run-benchmarks.sh
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

Key ADRs affecting Mind Engine:

- [ADR-0018: Hybrid Search RRF](../../docs/adr/0018-hybrid-search-rrf.md)
- [ADR-0031: Anti-Hallucination System](../../docs/adr/0031-anti-hallucination-system.md)
- [ADR-0032: Central Index with Local Overlay](../../docs/adr/0032-central-index-local-overlay.md)
- [ADR-0033: Adaptive Search Weights](../../docs/adr/0033-adaptive-search-weights-by-intent.md)

## Related Packages

- **@kb-labs/mind-orchestrator** - Query orchestration with agent modes
- **@kb-labs/mind-embeddings** - Embedding provider abstraction
- **@kb-labs/mind-vector-store** - Vector storage abstraction
- **LLM integration** - via platform `@kb-labs/sdk` (`ILLM`)
- **@kb-labs/mind-cli** - CLI commands for Mind

## Contributing

### Code Quality Standards

- **No god files** - Keep files under 500 lines
- **Single responsibility** - Each module has one job
- **Test coverage** - 100% on utilities, integration tests for flows
- **Type safety** - No `any` types
- **Documentation** - JSDoc on all public APIs

### Before Committing

```bash
# Build
pnpm build

# Run tests
pnpm test

# Run benchmarks (must not regress)
./scripts/run-benchmarks.sh
```

**Benchmark tolerance**: ±2% (e.g., 0.686-0.714 acceptable for 0.70 avg)

## License

Private - KB Labs internal use only.

## Support

For questions, check:
- [Mind Engine BENCHMARKS](./BENCHMARKS.md)
- [ADRs](../../docs/adr/)
- [CLAUDE.md](../../CLAUDE.md) - Development guide

---

**Last Updated**: 2025-12-09
**Version**: 0.1.0
**Status**: ✅ Production Ready (SDK migrated)
// Test change for embeddings analytics
