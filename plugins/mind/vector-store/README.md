# @kb-labs/mind-vector-store

**Vector storage abstraction for KB Labs Mind system.**

Unified interface for storing and searching vector embeddings, providing Qdrant integration with in-memory fallback for development and testing.

## Features

- **💾 Multiple Backends** - Qdrant, in-memory, file-based storage
- **🔍 Semantic Search** - Fast vector similarity search
- **🔄 Graceful Fallback** - Automatic fallback to memory store
- **📊 Metadata Filtering** - Filter by file type, language, repository
- **⚡ Batch Operations** - Efficient bulk insert/update/delete
- **✅ Integrity Checks** - Verify store consistency
- **📈 Statistics** - Track store size and performance
- **🎯 Collection Management** - Multiple isolated collections

## Architecture

```
mind-vector-store/
├── src/
│   ├── index.ts                 # Main exports
│   ├── stores/                  # Vector store implementations
│   │   ├── qdrant-store.ts      # Qdrant vector store (production)
│   │   ├── memory-store.ts      # In-memory store (dev/test)
│   │   └── file-store.ts        # File-based store (optional)
│   ├── store-factory.ts         # Factory pattern
│   └── types.ts                 # Store interfaces
```

## Usage

### Creating Vector Store

```typescript
import { usePlatform } from '@kb-labs/sdk';

// Get platform vector store (recommended - uses singleton)
const platform = usePlatform();
const vectorStore = platform.getVectorStore();

// Platform automatically provides the right implementation:
// - Qdrant in production (if configured)
// - In-memory for development/testing

// Manual creation (only if you need custom config)
import { QdrantVectorStore, MemoryVectorStore } from '@kb-labs/sdk';

const qdrantStore = new QdrantVectorStore({
  url: process.env.QDRANT_URL || 'http://localhost:6333',
  collection: 'mind-default',
  dimensions: 1536,
});

const memoryStore = new MemoryVectorStore({
  dimensions: 1536,
});
```

### Inserting Vectors

```typescript
import type { IndexedChunk } from '@kb-labs/sdk';

const chunks: IndexedChunk[] = [
  {
    id: 'chunk-1',
    content: 'JWT token validation in middleware',
    embedding: [0.1, -0.3, 0.5, ...], // 1536-dim vector
    metadata: {
      path: 'src/auth/middleware.ts',
      language: 'typescript',
      repository: 'my-project',
      startLine: 42,
      endLine: 58,
    },
  },
];

await vectorStore.upsert(chunks);
console.log('Inserted', chunks.length, 'chunks');
```

### Searching Vectors

```typescript
const queryEmbedding = [0.2, -0.1, 0.4, ...]; // From embedding provider

const results = await vectorStore.search({
  vector: queryEmbedding,
  limit: 10,
  threshold: 0.7, // Min similarity score
  filter: {
    language: 'typescript',
    repository: 'my-project',
  },
});

console.log('Found', results.length, 'results');
results.forEach(result => {
  console.log(`[${result.score.toFixed(2)}] ${result.chunk.metadata.path}`);
});
```

### Deleting Vectors

```typescript
// Delete specific chunks
await vectorStore.delete(['chunk-1', 'chunk-2']);

// Delete by filter
await vectorStore.deleteByFilter({
  repository: 'old-project',
});
```

## Vector Stores

### Qdrant Store

**Qdrant** is a high-performance vector database optimized for similarity search.

**Features:**
- ✅ Fast search (milliseconds)
- ✅ HNSW indexing for efficiency
- ✅ Metadata filtering
- ✅ Persistence
- ✅ Horizontal scaling

**Configuration:**
```typescript
{
  type: 'qdrant',
  url: 'http://localhost:6333',      // Qdrant server URL
  apiKey: process.env.QDRANT_API_KEY, // Optional (for cloud)
  collection: 'mind-default',         // Collection name
  dimensions: 1536,                   // Embedding dimensions
  distance: 'cosine',                 // 'cosine' | 'euclidean' | 'dot'
  indexConfig: {
    type: 'hnsw',                     // HNSW indexing
    m: 16,                            // Number of edges per node
    efConstruct: 100,                 // Construction time quality
  },
}
```

**Setup (Local):**
```bash
# Docker
docker run -p 6333:6333 qdrant/qdrant

# Or Docker Compose
docker-compose up qdrant
```

**Setup (Cloud):**
```bash
# Qdrant Cloud (qdrant.io)
export QDRANT_URL=https://your-cluster.qdrant.io
export QDRANT_API_KEY=your-api-key
```

### Memory Store

**In-memory vector store** for development and testing.

**Features:**
- ✅ Instant setup (no server)
- ✅ Fast for small datasets (<10K vectors)
- ✅ Good for tests
- ❌ No persistence (lost on restart)
- ❌ Limited scalability

**Configuration:**
```typescript
{
  type: 'memory',
  dimensions: 1536,
  distance: 'cosine', // 'cosine' | 'euclidean' | 'dot'
}
```

**Use cases:**
- Unit tests
- Local development without Qdrant
- CI/CD pipelines
- Quick prototyping

### File Store

**File-based vector store** for persistent local storage.

**Features:**
- ✅ Persistent (survives restarts)
- ✅ No server needed
- ✅ Good for small-medium datasets (<100K vectors)
- ❌ Slower than Qdrant
- ❌ No horizontal scaling

**Configuration:**
```typescript
{
  type: 'file',
  path: '.kb/mind/vectors',
  dimensions: 1536,
  distance: 'cosine',
  compression: true, // Compress on disk
}
```

**Storage format:**
```
.kb/mind/vectors/
├── metadata.json         # Store metadata
├── vectors.bin           # Binary vector data
└── index.json            # Index for fast lookup
```

## Advanced Features

### Metadata Filtering

Filter search results by metadata:

```typescript
const results = await vectorStore.search({
  vector: queryEmbedding,
  limit: 20,
  filter: {
    // Exact match
    language: 'typescript',
    repository: 'my-project',

    // Range (if supported)
    startLine: { gte: 100, lte: 200 },

    // Multiple values (OR)
    fileType: ['ts', 'tsx'],
  },
});
```

### Batch Operations

Efficient bulk operations:

```typescript
// Batch insert (up to 1000 chunks)
const chunks = [/* ... 1000 chunks ... */];
await vectorStore.upsertBatch(chunks, { batchSize: 100 });

// Batch search (multiple queries)
const queries = [emb1, emb2, emb3];
const allResults = await vectorStore.searchBatch(queries, { limit: 10 });
```

### Integrity Checks

Verify store consistency:

```typescript
const report = await vectorStore.verify();

console.log('Store status:', report.ok ? 'OK' : 'ERRORS');
console.log('Total vectors:', report.stats.totalVectors);
console.log('Inconsistencies:', report.inconsistencies);

if (!report.ok) {
  report.inconsistencies.forEach(issue => {
    console.error(`[${issue.code}] ${issue.message}`);
  });
}
```

**Checks performed:**
- ✅ Dimension consistency
- ✅ Missing vectors
- ✅ Duplicate IDs
- ✅ Corrupt embeddings
- ✅ Metadata integrity

### Statistics

Get store statistics:

```typescript
const stats = await vectorStore.getStats();

console.log('Total vectors:', stats.totalVectors);
console.log('Total collections:', stats.collectionCount);
console.log('Memory usage:', stats.memorySizeMB, 'MB');
console.log('Disk usage:', stats.diskSizeMB, 'MB');
```

### Collection Management

Manage multiple isolated collections:

```typescript
// Create collection
await vectorStore.createCollection('my-project', {
  dimensions: 1536,
  distance: 'cosine',
});

// List collections
const collections = await vectorStore.listCollections();
console.log('Collections:', collections);

// Delete collection
await vectorStore.deleteCollection('old-project');
```

## Performance

### Benchmark (100K vectors, 1536 dims)

| Operation | Qdrant | Memory | File |
|-----------|--------|--------|------|
| Insert (1K vectors) | ~500ms | ~100ms | ~2s |
| Search (top 10) | ~5ms | ~50ms | ~100ms |
| Batch search (100 queries) | ~200ms | ~2s | ~5s |

### Optimization Tips

1. **Use Qdrant for production** - Fastest and most scalable
2. **Batch operations** - 10-100x faster than individual ops
3. **Tune HNSW parameters** - Adjust `m` and `efConstruct` for speed/quality tradeoff
4. **Filter carefully** - Metadata filters can slow search
5. **Use appropriate distance** - Cosine for normalized vectors, dot product for raw

## Configuration

### Environment Variables

```bash
# Qdrant
export QDRANT_URL=http://localhost:6333
export QDRANT_API_KEY=your-api-key

# Default settings
export VECTOR_STORE_TYPE=qdrant
export VECTOR_STORE_COLLECTION=mind-default
export VECTOR_DIMENSIONS=1536
export VECTOR_DISTANCE=cosine
```

### Store Selection with Fallback

```typescript
async function createStoreWithFallback() {
  try {
    // Try Qdrant first
    return createVectorStore({
      type: 'qdrant',
      url: process.env.QDRANT_URL,
    });
  } catch {
    console.warn('Qdrant unavailable, using memory store');
    return createVectorStore({
      type: 'memory',
      dimensions: 1536,
    });
  }
}
```

## Dependencies

```json
{
  "dependencies": {
    "@kb-labs/sdk": "^1.0.0",
    "@qdrant/js-client-rest": "^1.7.0"
  }
}
```

## Testing

```bash
# Run unit tests (uses memory store)
pnpm test

# Test with real Qdrant
QDRANT_URL=http://localhost:6333 pnpm test:integration

# Benchmark
pnpm test:benchmark
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

## Best Practices

**DO ✅:**
- **Use Qdrant in production** - Best performance and scalability
- **Validate dimensions** - Ensure all vectors same size
- **Batch operations** - Much faster than individual ops
- **Use memory store for tests** - Fast, no setup needed
- **Filter efficiently** - Index metadata fields used in filters
- **Run integrity checks** - Verify store consistency regularly

**DON'T ❌:**
- **Use memory store in production** - No persistence, limited scale
- **Mix dimensions** - All vectors must be same size
- **Skip batch operations** - 10-100x slower individually
- **Ignore errors** - Handle store failures gracefully
- **Over-filter** - Each filter slows search

## Related Packages

- **@kb-labs/mind-engine** - Uses vector store for semantic search
- **@kb-labs/mind-embeddings** - Generates embeddings for storage

## Examples

### Example: Semantic Code Search

```typescript
import { createVectorStore, createEmbeddingProvider } from '@kb-labs/sdk';

// Setup
const embedder = createEmbeddingProvider({ type: 'openai' });
const store = createVectorStore({
  type: 'qdrant',
  url: 'http://localhost:6333',
  collection: 'my-codebase',
});

// Index code
const codeChunks = [
  { id: '1', content: 'JWT validation middleware', path: 'src/auth.ts' },
  { id: '2', content: 'User login handler', path: 'src/login.ts' },
  { id: '3', content: 'Database connection pool', path: 'src/db.ts' },
];

for (const chunk of codeChunks) {
  const embedding = await embedder.embed(chunk.content);
  await store.upsert([{
    id: chunk.id,
    content: chunk.content,
    embedding,
    metadata: { path: chunk.path },
  }]);
}

// Search
const queryEmb = await embedder.embed('authentication implementation');
const results = await store.search({
  vector: queryEmb,
  limit: 3,
});

console.log('Top results:');
results.forEach(r => {
  console.log(`[${r.score.toFixed(2)}] ${r.chunk.metadata.path}`);
});
```

## License

Private - KB Labs internal use only.

## Support

For questions, check:
- [Mind Engine README](../mind-engine/README.md)
- [Mind Embeddings README](../mind-embeddings/README.md)
- [CLAUDE.md](../../CLAUDE.md) - Development guide
- [Qdrant Documentation](https://qdrant.tech/documentation/)

---

**Last Updated**: 2025-12-09
**Version**: 0.1.0
**Status**: 🟡 SDK Migration Pending (Phase 3)
