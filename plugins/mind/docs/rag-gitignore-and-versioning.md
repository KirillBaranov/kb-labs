# RAG Gitignore and Versioning Strategy

## Overview

This document explains what files the Mind RAG system generates, whether they should be in `.gitignore`, and how version conflicts are handled.

## Generated Files and Directories

The Mind RAG system generates the following artifacts:

### 1. Vector Store Indexes (`.kb/mind/rag/`)

**Location:** `.kb/mind/rag/` (configurable via `indexDir`)

**Contents:**
- Vector embeddings for code chunks
- Metadata (file paths, spans, chunk IDs)
- Index files (format depends on vector store type)

**Local Vector Store:**
- JSON files with embeddings and metadata
- SQLite database (future)
- Index files for fast lookup

**Qdrant Vector Store:**
- No local files (data stored in Qdrant server)
- Only connection metadata cached locally (optional)

### 2. Embedding Cache (`.kb/mind/embeddings-cache/`)

**Location:** `.kb/mind/embeddings-cache/` (if caching enabled)

**Contents:**
- Cached embeddings for text chunks
- Keyed by content hash
- TTL-based expiration

### 3. Query Results Cache (`.kb/mind/query-cache/`)

**Location:** `.kb/mind/query-cache/` (if semantic caching enabled)

**Contents:**
- Cached query results
- Keyed by query hash
- TTL-based expiration

## Gitignore Strategy

### ✅ Should be in `.gitignore`

**All generated RAG artifacts should be ignored:**

```gitignore
# KB Labs Mind RAG artifacts
.kb/mind/rag/
.kb/mind/embeddings-cache/
.kb/mind/query-cache/
```

**Rationale:**
1. **Large file sizes**: Vector embeddings can be large (hundreds of MB for large codebases)
2. **Machine-specific**: Embeddings depend on the embedding model version and configuration
3. **Regeneratable**: All artifacts can be regenerated from source code
4. **Frequently changing**: Indexes update on every code change
5. **Binary/compressed formats**: Some vector stores use binary formats that don't diff well

### ❌ Should NOT be in `.gitignore`

**Configuration files:**
- `kb.config.json` - Contains RAG configuration (should be committed)

**Schema/metadata files** (if any):
- Schema version files (if used for migration)
- Version markers (if used for compatibility checks)

## Version Conflict Handling

### Schema Versioning

The RAG system uses **schema versioning** to handle format changes:

```typescript
interface VectorStoreMetadata {
  schemaVersion: string;  // e.g., "1.0"
  generator: string;       // e.g., "kb-labs-mind@0.1.0"
  updatedAt: string;      // ISO timestamp
}
```

### Conflict Resolution Strategies

#### 1. **Schema Version Mismatch**

**Scenario:** Index created with schema v1.0, but code expects v2.0

**Handling:**
- Detect version mismatch on load
- Attempt automatic migration if migration path exists
- If migration fails, regenerate index from scratch
- Log warning/error with migration details

**Implementation:**
```typescript
async function loadVectorStore(indexDir: string): Promise<VectorStore> {
  const metadata = await readMetadata(indexDir);
  
  if (metadata.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    if (canMigrate(metadata.schemaVersion, CURRENT_SCHEMA_VERSION)) {
      return await migrateIndex(metadata, CURRENT_SCHEMA_VERSION);
    } else {
      // Regenerate from scratch
      logger.warn(`Schema version mismatch: ${metadata.schemaVersion} -> ${CURRENT_SCHEMA_VERSION}. Regenerating index.`);
      return await regenerateIndex(indexDir);
    }
  }
  
  return loadExistingIndex(indexDir);
}
```

#### 2. **Generator Version Mismatch**

**Scenario:** Index created with `kb-labs-mind@0.1.0`, but running `kb-labs-mind@0.2.0`

**Handling:**
- Check compatibility based on SemVer rules
- Same major version: compatible, use as-is
- Different major version: may require migration or regeneration
- Log generator version for debugging

#### 3. **Git Merge Conflicts**

**Scenario:** Two developers commit different versions of `.kb/mind/rag/` (shouldn't happen if gitignored, but edge cases exist)

**Handling:**
- **Prevention**: Ensure `.gitignore` includes all RAG artifacts
- **Detection**: If conflicts occur, detect via hash mismatches
- **Resolution**: Regenerate index from current codebase state
- **Verification**: Use `kb mind verify` to check consistency

#### 4. **Embedding Model Version Changes**

**Scenario:** Configuration changed from `text-embedding-3-small` to `text-embedding-3-large`

**Handling:**
- Detect model change in configuration
- Invalidate all cached embeddings
- Regenerate embeddings with new model
- Update vector store dimension if changed

**Implementation:**
```typescript
async function checkEmbeddingModelCompatibility(
  config: EmbeddingConfig,
  existingMetadata: VectorStoreMetadata
): Promise<boolean> {
  const currentModel = config.provider?.openai?.model ?? 'text-embedding-3-small';
  const existingModel = existingMetadata.embeddingModel;
  
  if (currentModel !== existingModel) {
    logger.info(`Embedding model changed: ${existingModel} -> ${currentModel}. Regenerating embeddings.`);
    return false; // Incompatible, need regeneration
  }
  
  return true; // Compatible
}
```

#### 5. **Vector Store Type Changes**

**Scenario:** Configuration changed from `local` to `qdrant` or vice versa

**Handling:**
- Detect type change in configuration
- If migrating from local to Qdrant:
  - Export existing vectors from local store
  - Import into Qdrant
  - Remove local index files
- If migrating from Qdrant to local:
  - Export vectors from Qdrant
  - Create local index
  - Optionally keep Qdrant data for rollback

### Migration Paths

#### Supported Migrations

1. **Schema 1.0 → 1.1** (additive changes)
   - Add new optional fields
   - Preserve existing data
   - No regeneration needed

2. **Schema 1.x → 2.0** (breaking changes)
   - May require format conversion
   - Regenerate if migration not feasible
   - Provide migration script

#### Migration Script Example

```typescript
async function migrateIndex(
  fromVersion: string,
  toVersion: string,
  indexDir: string
): Promise<void> {
  if (fromVersion === '1.0' && toVersion === '1.1') {
    // Additive migration: add new fields
    const index = await loadIndex(indexDir);
    index.metadata = { ...index.metadata, newField: defaultValue };
    await saveIndex(indexDir, index);
  } else if (fromVersion.startsWith('1.') && toVersion.startsWith('2.')) {
    // Breaking change: regenerate
    throw new Error('Schema 2.0 requires full regeneration. Run: kb mind update --force');
  }
}
```

## Best Practices

### 1. **Always Regenerate on Pull**

After pulling changes that modify code:
```bash
kb mind update
```

This ensures indexes match the current codebase state.

### 2. **Verify After Conflicts**

If git conflicts occur (shouldn't happen with proper gitignore):
```bash
kb mind verify
```

This checks hash consistency and detects corruption.

### 3. **Version Pinning**

Pin Mind version in `package.json` to avoid unexpected schema changes:
```json
{
  "dependencies": {
    "@kb-labs/mind-cli": "^0.1.0"
  }
}
```

### 4. **CI/CD Considerations**

In CI/CD pipelines:
- Always regenerate indexes from scratch
- Don't cache `.kb/mind/rag/` between builds
- Cache only if:
  - Same codebase hash
  - Same Mind version
  - Same embedding model
  - Cache TTL is short (< 1 hour)

### 5. **Team Coordination**

- **Schema changes**: Coordinate major version bumps
- **Model changes**: Announce embedding model updates
- **Migration scripts**: Provide migration tools for schema upgrades
- **Documentation**: Update docs when breaking changes occur

## Current `.gitignore` Status

The current `.gitignore` in `kb-labs-mind` includes:

```gitignore
# KB Labs Mind artifacts
.kb/mind/
```

This covers **all** Mind artifacts, including:
- Traditional indexes (`.kb/mind/index.json`, etc.)
- RAG artifacts (`.kb/mind/rag/`, `.kb/mind/embeddings-cache/`, etc.)
- Query results (`.kb/mind/query/`, `.kb/mind/pack/`)

**Recommendation:** Keep this as-is. The entire `.kb/mind/` directory should be gitignored since:
1. All artifacts are regeneratable
2. They're machine-specific
3. They change frequently
4. They can be large

## Summary

| Artifact Type | Gitignore? | Version Conflict Handling |
|--------------|------------|---------------------------|
| Vector store indexes | ✅ Yes | Schema version check + migration/regeneration |
| Embedding cache | ✅ Yes | Model version check + invalidation |
| Query cache | ✅ Yes | TTL expiration + query hash check |
| Configuration | ❌ No | Git merge resolution (manual) |
| Schema metadata | ✅ Yes | Version comparison + migration |

**Key Takeaway:** All RAG artifacts are gitignored and regeneratable. Version conflicts are handled through schema versioning, automatic migration when possible, and regeneration when necessary.






