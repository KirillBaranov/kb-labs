# @kb-labs/mind-embeddings

**Embedding provider abstraction for KB Labs Mind system.**

Unified interface for generating text embeddings used in semantic search, providing OpenAI embeddings with deterministic fallback for development and testing.

## Features

- **🧮 Multiple Providers** - OpenAI, local models, deterministic fallback
- **🔄 Graceful Degradation** - Automatic fallback if primary provider fails
- **⚡ Batch Processing** - Efficient batch embedding generation
- **📊 Dimension Validation** - Ensure consistent embedding dimensions
- **💾 Caching** - Cache embeddings for repeated text
- **🎯 Provider Selection** - Easy switching between providers
- **📈 Analytics** - Track embedding usage and performance

## Architecture

```
mind-embeddings/
├── src/
│   ├── index.ts                 # Main exports
│   ├── providers/               # Embedding provider implementations
│   │   ├── openai.ts            # OpenAI embeddings (production)
│   │   ├── local.ts             # Local model embeddings
│   │   └── deterministic.ts     # Deterministic fallback (dev/test)
│   ├── provider-factory.ts      # Factory pattern
│   └── types.ts                 # Provider interfaces
```

## Usage

### Creating Embedding Provider

```typescript
import { usePlatform } from '@kb-labs/sdk';

// Get platform embeddings service (recommended - uses singleton)
const platform = usePlatform();
const embeddings = platform.getEmbeddings();

// Platform automatically provides the right implementation:
// - OpenAI in production (if OPENAI_API_KEY set)
// - Deterministic fallback for development/testing

// Example usage with platform
const embedding = await embeddings.embed('How does authentication work?');
const batch = await embeddings.embedBatch(['query 1', 'query 2', 'query 3']);

// Manual creation (only if you need custom config)
import { OpenAIEmbeddings, DeterministicEmbeddings } from '@kb-labs/sdk';

const openaiEmbeddings = new OpenAIEmbeddings({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'text-embedding-3-small',
});
```

### Embedding Single Text

```typescript
const embedding = await embeddingProvider.embed('How does authentication work?');

console.log('Dimensions:', embedding.length); // 1536 for OpenAI
console.log('First 5 values:', embedding.slice(0, 5));
// [0.123, -0.456, 0.789, ...]
```

### Embedding Batch

```typescript
const texts = [
  'What is VectorStore?',
  'How does hybrid search work?',
  'Explain RAG architecture',
];

const embeddings = await embeddingProvider.embedBatch(texts);

console.log('Generated', embeddings.length, 'embeddings');
embeddings.forEach((emb, idx) => {
  console.log(`Text ${idx}: ${emb.length} dimensions`);
});
```

## Providers

### OpenAI Provider

**Models available:**

| Model | Dimensions | Cost/1M tokens | Performance |
|-------|------------|----------------|-------------|
| `text-embedding-3-small` | 1536 | $0.02 | Fast, good quality |
| `text-embedding-3-large` | 3072 | $0.13 | Best quality, slower |
| `text-embedding-ada-002` | 1536 | $0.10 | Legacy model |

**Recommended**: `text-embedding-3-small` for balanced cost/quality

**Configuration:**
```typescript
{
  type: 'openai',
  apiKey: 'sk-...',
  model: 'text-embedding-3-small',
  dimensions: 1536,
  batchSize: 100, // Max texts per API call
}
```

**Features:**
- ✅ High-quality embeddings
- ✅ Fast batch processing (100 texts/call)
- ✅ Consistent dimensions
- ✅ Well-documented API

### Local Provider

**Supported backends:**
- **Sentence Transformers** - Python library for embeddings
- **Ollama** - Local LLM with embedding support
- **LM Studio** - GUI for local models
- **FastEmbed** - Lightweight embedding server

**Popular models:**
- `all-MiniLM-L6-v2` - 384 dims, fast
- `all-mpnet-base-v2` - 768 dims, balanced
- `e5-large-v2` - 1024 dims, high quality

**Configuration:**
```typescript
{
  type: 'local',
  endpoint: 'http://localhost:8080/embed',
  model: 'all-MiniLM-L6-v2',
  dimensions: 384,
  timeout: 30000, // 30s
}
```

**Setup (Sentence Transformers):**
```bash
# Install sentence-transformers
pip install sentence-transformers flask

# Start embedding server
python -m sentence_transformers.server --model all-MiniLM-L6-v2 --port 8080
```

### Deterministic Provider

**For development and testing only.**

Generates embeddings using deterministic hash function:

```typescript
hash(text) → [0.1, -0.3, 0.5, ...] // Always same for same input
```

**Benefits:**
- ✅ No API key needed
- ✅ Instant (no network calls)
- ✅ Reproducible tests
- ✅ No costs

**Limitations:**
- ❌ Poor semantic quality
- ❌ Not suitable for production
- ❌ No actual similarity matching

**Configuration:**
```typescript
{
  type: 'deterministic',
  dimensions: 1536, // Match production dimensions
  seed: 42, // Optional seed for reproducibility
}
```

**Use cases:**
- Unit tests
- Local development without API keys
- CI/CD pipelines
- Quick prototyping

## Advanced Features

### Caching

```typescript
import { EmbeddingCache } from '@kb-labs/mind-embeddings';

const cache = new EmbeddingCache({ maxSize: 10000 });
const provider = createEmbeddingProvider({
  type: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
});

async function cachedEmbed(text: string) {
  const cached = cache.get(text);
  if (cached) return cached;

  const embedding = await provider.embed(text);
  cache.set(text, embedding);
  return embedding;
}
```

### Dimension Normalization

Normalize embeddings to unit length for cosine similarity:

```typescript
import { normalizeEmbedding } from '@kb-labs/mind-embeddings';

const embedding = await provider.embed('Your text');
const normalized = normalizeEmbedding(embedding);

// Now dot product = cosine similarity
const similarity = dotProduct(normalized, otherNormalized);
```

### Dimension Reduction

Reduce embedding dimensions (e.g., 3072 → 1536):

```typescript
import { reduceDimensions } from '@kb-labs/mind-embeddings';

const embedding = await provider.embed('Your text'); // 3072 dims
const reduced = reduceDimensions(embedding, 1536); // 1536 dims
```

### Batch with Progress

```typescript
async function embedWithProgress(texts: string[]) {
  const embeddings: number[][] = [];
  const batchSize = 100;

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const batchEmbeddings = await provider.embedBatch(batch);
    embeddings.push(...batchEmbeddings);

    console.log(`Progress: ${i + batch.length}/${texts.length}`);
  }

  return embeddings;
}
```

## Configuration

### Environment Variables

```bash
# OpenAI
export OPENAI_API_KEY=sk-...
export EMBEDDING_MODEL=text-embedding-3-small

# Local
export EMBEDDING_ENDPOINT=http://localhost:8080/embed
export EMBEDDING_MODEL=all-MiniLM-L6-v2

# Fallback
export EMBEDDING_FALLBACK=deterministic
export EMBEDDING_DIMENSIONS=1536
```

### Provider Selection with Fallback

```typescript
async function createProviderWithFallback() {
  try {
    // Try OpenAI first
    return createEmbeddingProvider({
      type: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
    });
  } catch {
    console.warn('OpenAI unavailable, using deterministic fallback');
    return createEmbeddingProvider({
      type: 'deterministic',
      dimensions: 1536,
    });
  }
}
```

## Performance

### Benchmark (1000 texts, ~50 tokens each)

| Provider | Duration | Cost | Quality |
|----------|----------|------|---------|
| OpenAI (text-embedding-3-small) | ~5s | $0.001 | 9/10 |
| OpenAI (text-embedding-3-large) | ~8s | $0.007 | 10/10 |
| Local (all-MiniLM-L6-v2) | ~15s | $0 | 7/10 |
| Deterministic | ~0.1s | $0 | 2/10 |

### Optimization Tips

1. **Use batch processing** - 10-100x faster than individual embeds
2. **Cache embeddings** - Reuse for repeated text
3. **Choose right model** - `text-embedding-3-small` for most use cases
4. **Reduce dimensions** - If storage/memory is concern
5. **Parallelize** - Run multiple batches in parallel

## Dependencies

```json
{
  "dependencies": {
    "@kb-labs/sdk": "^1.0.0",
    "openai": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0"
  }
}
```

## Testing

```bash
# Run unit tests (uses deterministic provider)
pnpm test

# Test with real OpenAI (requires API key)
OPENAI_API_KEY=sk-... pnpm test:integration

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
- **Use OpenAI in production** - Best quality and reliability
- **Batch processing** - Much faster than individual calls
- **Cache embeddings** - Reduce API costs
- **Validate dimensions** - Ensure consistency across providers
- **Use deterministic for tests** - Fast, reproducible, free

**DON'T ❌:**
- **Use deterministic in production** - Poor semantic quality
- **Embed without batching** - 10-100x slower
- **Mix dimensions** - Ensure all embeddings same size
- **Skip error handling** - Handle API failures gracefully

## Related Packages

- **@kb-labs/mind-engine** - Uses embeddings for semantic search
- **@kb-labs/mind-vector-store** - Stores and searches embeddings

## Examples

### Example: Semantic Similarity

```typescript
import { cosineSimilarity } from '@kb-labs/mind-core';

const provider = createEmbeddingProvider({ type: 'openai' });

const emb1 = await provider.embed('How does authentication work?');
const emb2 = await provider.embed('What is the auth mechanism?');
const emb3 = await provider.embed('Unrelated topic');

console.log('Similarity (auth questions):', cosineSimilarity(emb1, emb2)); // ~0.9
console.log('Similarity (different topics):', cosineSimilarity(emb1, emb3)); // ~0.3
```

### Example: Semantic Search

```typescript
const query = 'authentication implementation';
const documents = [
  'JWT token validation in middleware',
  'User login with OAuth2',
  'React component rendering',
  'Database migration script',
];

// Embed query and documents
const queryEmb = await provider.embed(query);
const docEmbs = await provider.embedBatch(documents);

// Calculate similarities
const similarities = docEmbs.map((docEmb, idx) => ({
  text: documents[idx],
  similarity: cosineSimilarity(queryEmb, docEmb),
}));

// Sort by similarity
similarities.sort((a, b) => b.similarity - a.similarity);

console.log('Top results:');
similarities.forEach(result => {
  console.log(`[${result.similarity.toFixed(2)}] ${result.text}`);
});
```

## License

Private - KB Labs internal use only.

## Support

For questions, check:
- [Mind Engine README](../mind-engine/README.md)
- [Mind Vector Store README](../mind-vector-store/README.md)
- [CLAUDE.md](../../CLAUDE.md) - Development guide

---

**Last Updated**: 2025-12-09
**Version**: 0.1.0
**Status**: 🟡 SDK Migration Pending (Phase 3)
