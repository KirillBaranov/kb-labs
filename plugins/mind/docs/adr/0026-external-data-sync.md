# ADR-0026: External Data Synchronization for Mind

**Date:** 2025-01-15
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-01-15
**Tags:** [architecture, sync, external-data, plugins]

## Context

Mind V2 needs a mechanism to synchronize external data sources (ClickUp, Git, Confluence, etc.) into its knowledge base. The synchronization should:

1. Be independent from the Knowledge API (not tied to knowledge-core)
2. Allow plugins to add/update/delete documents from external sources
3. Support incremental updates (only changed chunks)
4. Support soft-delete with TTL
5. Provide both CLI and REST API interfaces
6. Be extensible for future data sources

## Decision

We will implement a **minimalistic Core API** in `mind-engine` with **CLI and REST interfaces** that plugins can use to synchronize external documents.

### Architecture

```
┌─────────────────────────────────────────┐
│  Plugins (external)                      │
│  - clickup-sync                           │
│  - git-sync                              │
│  - confluence-sync                      │
└──────────────┬──────────────────────────┘
               │ Uses CLI or REST
               ▼
┌─────────────────────────────────────────┐
│  Interfaces (mind-cli, mind-gateway)    │
│  - CLI: kb mind sync                    │
│  - REST: /v1/plugins/mind/sync         │
└──────────────┬──────────────────────────┘
               │ Uses
               ▼
┌─────────────────────────────────────────┐
│  Core API (mind-engine/sync)            │
│  - DocumentSyncAPI                      │
│  - DocumentRegistry                     │
│  - Partial Updates                      │
│  - Soft-Delete                          │
└──────────────┬──────────────────────────┘
               │ Uses
               ▼
┌─────────────────────────────────────────┐
│  Infrastructure (mind-engine)           │
│  - VectorStore                          │
│  - Chunker                              │
│  - EmbeddingProvider                   │
└─────────────────────────────────────────┘
```

### Core Components

1. **DocumentSyncAPI** (`mind-engine/src/sync/document-sync.ts`)
   - `addDocument()` - Add a new document
   - `updateDocument()` - Update existing document (with partial updates)
   - `deleteDocument()` - Delete document (soft-delete supported)
   - `listDocuments()` - List synchronized documents
   - `restoreDocument()` - Restore soft-deleted document

2. **DocumentRegistry** (`mind-engine/src/sync/registry/`)
   - Tracks documents: `source:id:scopeId → DocumentRecord`
   - Filesystem-based (JSON file)
   - Future: Database support

3. **Partial Updates** (`mind-engine/src/sync/partial-update.ts`)
   - Chunk-level change detection
   - Only updates changed chunks
   - Falls back to full update if too many changes

4. **Soft-Delete** (`mind-engine/src/sync/document-sync.ts`)
   - Marks documents as deleted
   - TTL-based cleanup
   - Restoration support

5. **Batch Operations** (`mind-engine/src/sync/batch-sync.ts`)
   - Process multiple operations at once
   - Size limits with override
   - Partial success handling

6. **Metrics** (`mind-engine/src/sync/metrics.ts`)
   - Track sync statistics
   - Documents/chunks by source/scope
   - Error tracking

### CLI Interface

```bash
# Add document
kb mind sync add --source clickup --id doc-123 --scope docs --content "..."

# Update document
kb mind sync update --source clickup --id doc-123 --scope docs --content "..."

# Delete document
kb mind sync delete --source clickup --id doc-123 --scope docs

# List documents
kb mind sync list [--source clickup] [--scope docs]

# Batch operations
kb mind sync batch --file operations.json [--max-size 500]

# Status/metrics
kb mind sync status [--source clickup] [--scope docs]

# Restore soft-deleted
kb mind sync restore --source clickup --id doc-123 --scope docs

# Cleanup old deleted
kb mind sync cleanup [--deleted-only] [--ttl-days 30]
```

### REST API Interface

```
POST   /v1/plugins/mind/sync/add       # Add document
POST   /v1/plugins/mind/sync/update   # Update document
DELETE /v1/plugins/mind/sync/delete    # Delete document
GET    /v1/plugins/mind/sync/list     # List documents
POST   /v1/plugins/mind/sync/batch    # Batch operations
GET    /v1/plugins/mind/sync/status   # Metrics
POST   /v1/plugins/mind/sync/restore  # Restore document
POST   /v1/plugins/mind/sync/cleanup  # Cleanup deleted
```

### Configuration

```json
{
  "knowledge": {
    "sync": {
      "registry": {
        "type": "filesystem",
        "path": ".kb/mind/sync/registry.json",
        "backup": true,
        "backupRetention": 7
      },
      "batch": {
        "maxSize": 100,
        "maxSizeOverride": 1000
      },
      "softDelete": {
        "enabled": true,
        "ttlDays": 30
      },
      "partialUpdates": {
        "enabled": true,
        "similarityThreshold": 0.8
      }
    }
  }
}
```

## Rationale

### Why Minimalistic Core API?

- **Independence**: Core doesn't know about ClickUp, Git, etc.
- **Simplicity**: Only essential operations (add/update/delete/list)
- **Flexibility**: Plugins implement their own sync logic

### Why Filesystem Registry First?

- **Simplicity**: No external dependencies
- **Version Control**: Can be tracked in Git
- **Future-Proof**: Can add database support later

### Why Partial Updates?

- **Performance**: Only re-index changed chunks
- **Cost**: Fewer embedding API calls
- **Efficiency**: Faster sync for large documents

### Why Soft-Delete?

- **Recovery**: Can restore accidentally deleted documents
- **Audit**: Track deletion history
- **TTL**: Automatic cleanup after period

### Why Both CLI and REST?

- **CLI**: For automation, scripts, cron jobs
- **REST**: For webhooks, external services
- **Flexibility**: Choose based on use case

## Consequences

### Positive

- **Extensibility**: Easy to add new data sources via plugins
- **Performance**: Partial updates reduce processing time
- **Reliability**: Soft-delete prevents data loss
- **Monitoring**: Metrics track sync health
- **Independence**: Core doesn't depend on external systems

### Negative

- **Complexity**: Additional abstraction layer
- **Storage**: Registry file grows with documents
- **Limitations**: Partial updates may not work for all cases

### Mitigation Strategies

- **Registry Size**: Can migrate to database for large scale
- **Partial Updates**: Falls back to full update if needed
- **Documentation**: Clear examples for plugin developers

## Implementation

### Phase 1: Core API ✅
- DocumentSyncAPI with add/update/delete/list
- FileSystemRegistry
- Basic metrics

### Phase 2: Advanced Features ✅
- Partial updates (chunk-level)
- Soft-delete with TTL
- Batch operations with limits

### Phase 3: Interfaces ✅
- CLI command (`mind:sync`)
- REST API handlers
- Validation and error handling

### Phase 4: Documentation ✅
- ADR document
- README with examples
- Plugin development guide

## Future Enhancements

- Database registry support
- Webhook support for real-time sync
- Conflict resolution strategies
- Version history tracking
- Authorization by scope (future ADR)

## Alternatives Considered

### Option A: Knowledge API Integration
- **Pros**: Reuse existing infrastructure
- **Cons**: Tight coupling, less flexible
- **Decision**: Rejected - need independence

### Option B: Separate Sync Service
- **Pros**: Complete isolation
- **Cons**: More complexity, deployment overhead
- **Decision**: Rejected - over-engineering

### Option C: Plugin-Only Approach
- **Pros**: Maximum flexibility
- **Cons**: No common interface, duplication
- **Decision**: Rejected - need standardization

## References

- [ADR-0002: Plugins and Extensibility](./0002-plugins-and-extensibility.md)
- [ADR-0021: Incremental Indexing](./0021-incremental-indexing.md)
- [ADR-0016: Vector Store Abstraction](./0016-vector-store-abstraction.md)

---

**Last Updated:** 2025-01-15  
**Next Review:** 2025-04-15 (quarterly review)



