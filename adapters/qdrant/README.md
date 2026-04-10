# @kb-labs/adapters-qdrant

> Part of [KB Labs](https://github.com/KirillBaranov/kb-labs) ecosystem. Works exclusively within KB Labs platform.

High-performance vector database adapter for semantic search and RAG applications using Qdrant.

## Overview

| Property | Value |
|----------|-------|
| **Implements** | `IVectorStore` |
| **Type** | `core` |
| **Requires** | None |
| **Category** | Database / AI |

## Features

- **Vector Search** - Fast nearest neighbor search
- **Hybrid Search** - Combine dense and sparse vectors
- **Filtering** - Payload-based filtering with any query
- **Batch Operations** - Efficient bulk upsert and delete
- **Scalable** - Handles millions of vectors

## Installation

```bash
pnpm add @kb-labs/adapters-qdrant
```

## Configuration

Add to your `kb.config.json`:

```json
{
  "platform": {
    "adapters": {
      "vectorStore": "@kb-labs/adapters-qdrant"
    },
    "adapterOptions": {
      "vectorStore": {
        "url": "http://localhost:6333",
        "collectionName": "kb-vectors",
        "dimension": 1536
      }
    }
  }
}
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | `string` | - | Qdrant server URL |
| `apiKey` | `string` | - | API key for authentication (optional) |
| `collectionName` | `string` | `"kb-vectors"` | Collection name |
| `dimension` | `number` | `1536` | Vector dimension (1536 for OpenAI) |
| `timeout` | `number` | `30000` | Request timeout in ms |

## Usage

### Via Platform (Recommended)

```typescript
import { usePlatform } from '@kb-labs/sdk';

const platform = usePlatform();

// Upsert vectors
await platform.vectorStore.upsert([
  {
    id: 'doc-1',
    vector: [0.1, 0.2, ...], // 1536 dimensions
    payload: { title: 'Document 1', category: 'tech' }
  }
]);

// Search
const results = await platform.vectorStore.search({
  vector: queryVector,
  limit: 10,
  filter: { category: 'tech' }
});

// Delete
await platform.vectorStore.delete(['doc-1', 'doc-2']);
```

### Standalone (Testing/Development)

```typescript
import { createAdapter } from '@kb-labs/adapters-qdrant';

const vectorStore = createAdapter({
  url: 'http://localhost:6333',
  collectionName: 'test-vectors',
  dimension: 1536
});

await vectorStore.upsert([{ id: '1', vector: [...], payload: {} }]);
```

## Adapter Manifest

```typescript
{
  id: 'qdrant-vectorstore',
  name: 'Qdrant Vector Store',
  version: '1.0.0',
  implements: 'IVectorStore',
  capabilities: {
    search: true,
    batch: true,
    custom: {
      hybridSearch: true,
      filtering: true,
    },
  },
}
```

## FAQ

<details>
<summary><strong>Q: How do I start Qdrant locally?</strong></summary>

Use Docker:

```bash
docker run -p 6333:6333 qdrant/qdrant
```
</details>

<details>
<summary><strong>Q: What embedding dimension should I use?</strong></summary>

- OpenAI `text-embedding-3-small`: 1536
- OpenAI `text-embedding-3-large`: 3072
- Cohere: 1024
</details>

<details>
<summary><strong>Q: How do I use hybrid search?</strong></summary>

Enable hybrid search in your query:

```typescript
const results = await vectorStore.search({
  vector: denseVector,
  sparseVector: sparseVector,
  limit: 10
});
```
</details>

## Related Adapters

| Adapter | Use Case |
|---------|----------|
| `@kb-labs/adapters-openai` | Generate embeddings for vectors |
| `@kb-labs/adapters-mongodb` | Document storage alongside vectors |

## License

[KB Public License v1.1](../../LICENSE) - KB Labs Team
