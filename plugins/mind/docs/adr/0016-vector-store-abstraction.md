# ADR-0016: Vector Store Abstraction for Multi-Backend Support

**Date:** 2025-11-18
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-18
**Tags:** [architecture, storage, abstraction]

## Context

Mind v2 needs to store and retrieve vector embeddings for semantic search. Different deployment scenarios require different storage backends:

- **Local Development**: Simple file-based storage without external dependencies
- **Production**: Scalable vector database (Qdrant) for performance and persistence
- **Testing**: In-memory storage for fast test execution

We need a flexible architecture that supports multiple backends while maintaining a consistent interface.

## Decision

We will implement a **pluggable vector store abstraction** with factory pattern:

1. **VectorStore Interface**: Common interface for all implementations
2. **Factory Function**: `createVectorStore()` selects implementation based on config
3. **Auto Mode**: Automatically selects best available backend
4. **Explicit Mode**: Allows explicit backend selection

### Architecture

```typescript
export interface VectorStore {
  search(
    scopeId: string,
    vector: EmbeddingVector,
    limit: number,
    filters?: VectorSearchFilters,
  ): Promise<VectorSearchMatch[]>;
  
  replaceScope(scopeId: string, chunks: StoredMindChunk[]): Promise<void>;
  updateScope?(scopeId: string, chunks: StoredMindChunk[], fileMetadata?: Map<string, FileMetadata>): Promise<void>;
  scopeExists?(scopeId: string): Promise<boolean>;
  getAllChunks?(scopeId: string, filters?: VectorSearchFilters): Promise<StoredMindChunk[]>;
}

export function createVectorStore(
  config: VectorStoreConfig,
  runtime: RuntimeAdapter,
): VectorStore {
  // Auto mode: try Qdrant first, fallback to local
  if (config.type === 'auto') {
    const qdrantUrl = runtime.env.get('QDRANT_URL') ?? config.qdrant?.url;
    if (qdrantUrl) {
      return new QdrantVectorStore({ ... });
    }
    return new LocalVectorStore({ ... });
  }
  
  // Explicit selection
  switch (config.type) {
    case 'qdrant': return new QdrantVectorStore({ ... });
    case 'local': return new LocalVectorStore({ ... });
  }
}
```

### Implementations

1. **QdrantVectorStore**: Production-ready vector database
   - HTTP API-based
   - Supports incremental updates
   - Persistent storage
   - Scalable for large codebases

2. **LocalVectorStore**: File-based storage
   - JSON files in `.kb/mind/indexes/`
   - No external dependencies
   - Suitable for development and small projects

## Rationale

### Why Abstraction?

- **Flexibility**: Easy to add new backends (Pinecone, Weaviate, etc.)
- **Testability**: Can use in-memory implementations for tests
- **Development**: Local storage for offline development
- **Production**: Scalable backend for production use

### Why Factory Pattern?

- **Auto-Detection**: Automatically selects best available backend
- **Configuration-Driven**: Easy to configure via `kb.config.json`
- **Runtime Selection**: Can switch backends without code changes

### Why Qdrant as Primary?

- **Open Source**: Self-hostable, no vendor lock-in
- **Performance**: Fast vector search, supports large datasets
- **Features**: Incremental updates, filtering, metadata support
- **Docker-Friendly**: Easy to run locally with Docker

## Consequences

### Positive

- **Flexibility**: Easy to switch backends
- **Development Experience**: Works offline with local storage
- **Production Ready**: Scalable Qdrant backend
- **Testability**: Can mock or use in-memory implementations
- **Future-Proof**: Easy to add new backends

### Negative

- **Abstraction Overhead**: Interface may not expose all backend features
- **Configuration Complexity**: Need to understand different backends
- **Migration**: Switching backends requires re-indexing

### Mitigation Strategies

- **Extensible Interface**: Can add backend-specific methods
- **Clear Documentation**: Document each backend's capabilities
- **Migration Tools**: Provide utilities for backend migration

## Implementation

### Configuration

```json
{
  "knowledge": {
    "engines": [{
      "options": {
        "vectorStore": {
          "type": "auto",
          "qdrant": {
            "url": "http://localhost:6333"
          },
          "local": {
            "indexDir": ".kb/mind/indexes"
          }
        }
      }
    }]
  }
}
```

### Auto Mode Behavior

1. Check for `QDRANT_URL` environment variable
2. If found, use Qdrant backend
3. Otherwise, fallback to Local backend
4. Log selection for debugging

## Testing Strategy

- Unit tests for each implementation
- Integration tests for factory selection
- Test auto-mode fallback behavior
- Test incremental updates (Qdrant-specific)

## Future Enhancements

- Add Pinecone backend
- Add Weaviate backend
- Add in-memory backend for testing
- Add migration utilities between backends

## Alternatives Considered

### Single Backend (Qdrant Only)

- **Pros**: Simpler codebase
- **Cons**: Requires Qdrant for development, harder to test
- **Decision**: Rejected - need flexibility

### No Abstraction (Direct Qdrant)

- **Pros**: Simpler, can use all Qdrant features
- **Cons**: Hard to test, requires Qdrant always
- **Decision**: Rejected - need abstraction for flexibility

### Plugin System

- **Pros**: Maximum flexibility
- **Cons**: Over-engineering for current needs
- **Decision**: Rejected - factory pattern is sufficient

## References

- [Qdrant Documentation](https://qdrant.tech/documentation/)
- [ADR-0015: Search Result Compression](./0015-search-result-compression.md)

---

**Last Updated:** 2025-11-18  
**Next Review:** 2026-02-18 (quarterly review)

