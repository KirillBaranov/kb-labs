# Mind Document Synchronization API

Independent channel for synchronizing external data sources (ClickUp, Git, Confluence, etc.) into Mind's Mind index.

## Overview

The sync API provides a minimalistic interface for plugins to add, update, and delete documents from external sources. It's designed to be:

- **Independent**: Not tied to Knowledge API
- **Extensible**: Plugins implement their own sync logic
- **Efficient**: Partial updates, soft-delete, batch operations
- **Flexible**: Both CLI and REST interfaces

## Quick Start

### CLI Usage

```bash
# Add a document
kb mind sync add \
  --source clickup \
  --id doc-123 \
  --scope docs \
  --content "Document content..."

# Update a document
kb mind sync update \
  --source clickup \
  --id doc-123 \
  --scope docs \
  --content "Updated content..."

# Delete a document
kb mind sync delete \
  --source clickup \
  --id doc-123 \
  --scope docs

# List documents
kb mind sync list --source clickup --scope docs

# Batch operations
kb mind sync batch --file operations.json
```

### Programmatic Usage

```typescript
import {
  DocumentSyncAPI,
  createRegistry,
  type AddDocumentOptions,
} from '@kb-labs/mind-engine';

// Create API instance (requires vectorStore, embeddingProvider, runtime)
const api = new DocumentSyncAPI({
  registry: createRegistry({ type: 'filesystem', path: '.kb/mind/sync/registry.json' }),
  vectorStore,
  embeddingProvider,
  runtime,
});

// Add document
await api.addDocument({
  source: 'clickup',
  id: 'doc-123',
  scopeId: 'docs',
  content: 'Document content...',
  metadata: { title: 'My Doc', url: 'https://...' },
});
```

## Features

### Partial Updates

Only changed chunks are re-indexed, reducing processing time and API costs:

```typescript
// If only one chunk changed, only that chunk is updated
await api.updateDocument({
  source: 'clickup',
  id: 'doc-123',
  scopeId: 'docs',
  content: 'Updated content with small changes...',
});
```

### Soft-Delete

Documents are marked as deleted but can be restored:

```bash
# Soft delete
kb mind sync delete --source clickup --id doc-123 --scope docs

# Restore
kb mind sync restore --source clickup --id doc-123 --scope docs

# Cleanup old deleted (after TTL)
kb mind sync cleanup --deleted-only --ttl-days 30
```

### Batch Operations

Process multiple operations at once:

```json
// operations.json
{
  "operations": [
    {
      "operation": "add",
      "source": "clickup",
      "id": "doc-123",
      "scopeId": "docs",
      "content": "...",
      "metadata": {"title": "Doc 1"}
    },
    {
      "operation": "update",
      "source": "clickup",
      "id": "doc-456",
      "scopeId": "docs",
      "content": "..."
    }
  ]
}
```

```bash
kb mind sync batch --file operations.json --max-size 500
```

### Metrics

Track synchronization statistics:

```bash
kb mind sync status --source clickup --scope docs
```

Returns:
```json
{
  "totalDocuments": 1000,
  "totalChunks": 15000,
  "documentsBySource": {
    "clickup": 500,
    "git": 300
  },
  "chunksBySource": {
    "clickup": 7500,
    "git": 4500
  },
  "lastSyncTime": {
    "clickup": "2025-01-15T10:30:00Z"
  },
  "deletedDocuments": 50
}
```

## Configuration

Configure sync behavior in `kb.config.json`:

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

## Plugin Development

Plugins can use the sync API to synchronize external data:

### Example: ClickUp Plugin

```typescript
// plugins/clickup-sync/src/index.ts
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function syncClickUpDocs(workspaceId: string, scopeId: string) {
  // Fetch documents from ClickUp API
  const docs = await fetchClickUpDocs(workspaceId);
  
  // Sync each document
  for (const doc of docs) {
    await execAsync(
      `kb mind sync add ` +
      `--source clickup ` +
      `--id "${doc.id}" ` +
      `--scope ${scopeId} ` +
      `--content "${doc.content}" ` +
      `--metadata '${JSON.stringify(doc.metadata)}'`
    );
  }
}
```

### Example: Git Hook

```bash
#!/bin/bash
# plugins/git-sync/hooks/post-merge

# Get changed markdown files
changed_files=$(git diff --name-only HEAD~1 HEAD | grep '\.md$')

# Sync each file
for file in $changed_files; do
  content=$(cat "$file")
  commit_hash=$(git rev-parse HEAD:$file)
  
  kb mind sync add \
    --source git \
    --id "$commit_hash" \
    --scope docs \
    --content "$content" \
    --metadata "{\"file\":\"$file\",\"commit\":\"$(git rev-parse HEAD)\"}"
done
```

## API Reference

### DocumentSyncAPI

#### `addDocument(options: AddDocumentOptions): Promise<SyncResult>`

Add a new document to the Mind index.

#### `updateDocument(options: UpdateDocumentOptions): Promise<SyncResult>`

Update an existing document. Uses partial updates if enabled.

#### `deleteDocument(options: DeleteDocumentOptions): Promise<SyncResult>`

Delete a document. Uses soft-delete if enabled.

#### `listDocuments(options?: ListDocumentsOptions): Promise<DocumentRecord[]>`

List synchronized documents.

#### `restoreDocument(options: DeleteDocumentOptions): Promise<SyncResult>`

Restore a soft-deleted document.

### Types

See `types.ts` for complete type definitions:

- `ExternalDocument`
- `DocumentRecord`
- `SyncResult`
- `BatchSyncResult`
- `SyncMetrics`
- `SyncConfig`

## Architecture

See [ADR-0026](../../docs/adr/0026-external-data-sync.md) for detailed architecture decisions.

## Limitations

- Partial updates may fall back to full update if too many chunks changed
- Registry is filesystem-based (database support planned)
- No built-in conflict resolution (plugins handle this)

## Future Enhancements

- Database registry support
- Webhook support for real-time sync
- Conflict resolution strategies
- Version history tracking
- Authorization by scope



