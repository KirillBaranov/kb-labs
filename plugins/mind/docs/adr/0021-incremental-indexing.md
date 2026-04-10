# ADR-0021: Incremental Indexing for Efficient Updates

**Date:** 2025-11-18
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-18
**Tags:** [architecture, indexing, performance]

## Context

Re-indexing entire codebases is expensive:

- **Time**: Large codebases take minutes to index
- **Resources**: CPU and memory intensive
- **Unnecessary**: Most files don't change between runs
- **User Experience**: Slow feedback loop

We need a strategy to update only changed files while maintaining index consistency.

## Decision

We will implement **incremental indexing** using file metadata:

1. **File Metadata**: Track file hash and modification time
2. **Change Detection**: Compare metadata to detect changes
3. **Selective Updates**: Only re-index changed files
4. **Deletion Handling**: Remove chunks from deleted files

### Architecture

```typescript
interface FileMetadata {
  path: string;
  mtime: number;  // Modification time
  hash: string;   // Content hash (SHA-256)
}

// During indexing
const fileMetadata = new Map<string, FileMetadata>();
for (const file of files) {
  const content = await fs.readFile(file);
  const hash = createHash('sha256').update(content).digest('hex');
  const stats = await fs.stat(file);
  
  fileMetadata.set(file, {
    path: file,
    mtime: stats.mtimeMs,
    hash,
  });
}

// Incremental update
if (vectorStore.updateScope && await vectorStore.scopeExists(scopeId)) {
  // Compare with existing metadata
  const existingChunks = await vectorStore.getAllChunks(scopeId);
  const changedFiles = detectChangedFiles(existingChunks, fileMetadata);
  
  // Delete chunks from changed/deleted files
  await deleteChunksForFiles(changedFiles);
  
  // Re-index only changed files
  await indexFiles(changedFiles);
} else {
  // Full rebuild for new scope
  await vectorStore.replaceScope(scopeId, allChunks);
}
```

### Change Detection

1. **Hash Comparison**: Compare content hash (most reliable)
2. **Mtime Comparison**: Compare modification time (faster)
3. **Combined**: Use both for robustness

### Update Strategy

1. **Detect Changes**: Compare file metadata
2. **Delete Old**: Remove chunks from changed/deleted files
3. **Re-Index**: Index only changed files
4. **Upsert**: Add new chunks to vector store

## Rationale

### Why Incremental?

- **Performance**: Much faster for large codebases
- **User Experience**: Faster feedback loop
- **Resource Efficiency**: Less CPU and memory usage
- **Scalability**: Works for very large codebases

### Why File Metadata?

- **Reliable**: Hash detects all changes
- **Fast**: Mtime is quick to check
- **Simple**: Easy to implement and understand
- **Standard**: Common approach in build systems

### Why Combined Hash + Mtime?

- **Reliability**: Hash catches all changes
- **Performance**: Mtime is faster for initial check
- **Robustness**: Works even if mtime is unreliable
- **Flexibility**: Can optimize based on use case

## Consequences

### Positive

- **Performance**: 10-100x faster for incremental updates
- **User Experience**: Faster feedback loop
- **Resource Efficiency**: Less CPU and memory
- **Scalability**: Works for very large codebases

### Negative

- **Complexity**: More complex than full rebuild
- **Edge Cases**: Need to handle file moves, renames
- **Storage**: Need to store file metadata
- **Consistency**: Need to ensure index consistency

### Mitigation Strategies

- **Fallback**: Full rebuild if incremental fails
- **Validation**: Verify index consistency
- **Clear Errors**: Log when incremental update fails
- **Documentation**: Document edge cases

## Implementation

### File Metadata Storage

- Stored in vector store payload (`fileHash`, `fileMtime`)
- Extracted from existing chunks during update
- Compared with new file metadata

### Update Flow

```typescript
async updateScope(
  scopeId: string,
  chunks: StoredMindChunk[],
  fileMetadata: Map<string, FileMetadata>,
): Promise<void> {
  // Get existing chunks
  const existingChunks = await this.getAllChunks(scopeId);
  
  // Detect changes
  const changedFiles = detectChangedFiles(existingChunks, fileMetadata);
  const deletedFiles = detectDeletedFiles(existingChunks, fileMetadata);
  
  // Delete old chunks
  await this.deleteChunksForFiles([...changedFiles, ...deletedFiles]);
  
  // Re-index changed files
  const newChunks = chunks.filter(c => changedFiles.has(c.path));
  await this.upsertChunks(newChunks);
}
```

### Configuration

Incremental indexing is automatic when:
- `vectorStore.updateScope` is available
- `vectorStore.scopeExists` returns true
- File metadata is provided

## Testing Strategy

- Unit tests for change detection
- Integration tests for incremental updates
- Test with file modifications
- Test with file deletions
- Test with file additions

## Future Enhancements

- File move/rename detection
- Dependency-aware updates
- Parallel indexing of changed files
- Index consistency validation

## Alternatives Considered

### Full Rebuild Always

- **Pros**: Simple, always consistent
- **Cons**: Slow, resource intensive
- **Decision**: Rejected - too slow for large codebases

### Timestamp-Only

- **Pros**: Faster than hash
- **Cons**: Less reliable, can miss changes
- **Decision**: Rejected - need reliability

### External Change Tracking

- **Pros**: More sophisticated (Git integration)
- **Cons**: External dependency, complexity
- **Decision**: Rejected - file metadata is sufficient

## References

- [ADR-0016: Vector Store Abstraction](./0016-vector-store-abstraction.md)
- [Qdrant Update Operations](https://qdrant.tech/documentation/concepts/points/)

---

**Last Updated:** 2025-11-18  
**Next Review:** 2026-02-18 (quarterly review)

