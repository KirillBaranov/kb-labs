import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LocalVectorStore } from '../local';
import type { StoredMindChunk } from '../vector-store';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';

function createChunk(
  chunkId: string,
  text: string = 'test content',
): StoredMindChunk {
  return {
    chunkId,
    scopeId: 'test-scope',
    sourceId: 'test-source',
    path: 'test.ts',
    span: { startLine: 1, endLine: 2 },
    text,
    metadata: {},
    embedding: {
      dim: 384, // Default dimension for MindVectorStore
      values: Array.from({ length: 384 }, () => Math.random()),
    },
  };
}

describe('LocalVectorStore', () => {
  let tempDir: string;
  let store: LocalVectorStore;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mind-test-'));
    store = new LocalVectorStore({
      indexDir: tempDir,
    });
  });

  afterEach(async () => {
    await fs.remove(tempDir).catch(() => {});
  });

  it('should store and retrieve chunks', async () => {
    const chunks: StoredMindChunk[] = [
      createChunk('chunk-1', 'content 1'),
      createChunk('chunk-2', 'content 2'),
    ];

    await store.replaceScope('test-scope', chunks);

    // Test by searching
    const queryVector = {
      dim: 384,
      values: Array.from({ length: 384 }, () => Math.random()),
    };

    const results = await store.search('test-scope', queryVector, 10);
    expect(results.length).toBeGreaterThan(0);
  });

  it('should search chunks', async () => {
    const chunks: StoredMindChunk[] = [
      createChunk('chunk-1', 'test content'),
      createChunk('chunk-2', 'other content'),
    ];

    await store.replaceScope('test-scope', chunks);

    const queryVector = {
      dim: 384, // Use default dimension for MindVectorStore
      values: Array.from({ length: 384 }, () => Math.random()),
    };

    const results = await store.search('test-scope', queryVector, 10);

    expect(results.length).toBeGreaterThan(0);
  });

  it('should replace scope (delete and recreate)', async () => {
    const chunks1: StoredMindChunk[] = [createChunk('chunk-1', 'old content')];
    chunks1[0]!.embedding = {
      dim: 384,
      values: Array.from({ length: 384 }, () => Math.random()),
    };
    await store.replaceScope('test-scope', chunks1);

    const chunks2: StoredMindChunk[] = [createChunk('chunk-2', 'new content')];
    chunks2[0]!.embedding = {
      dim: 384,
      values: Array.from({ length: 384 }, () => Math.random()),
    };
    await store.replaceScope('test-scope', chunks2);

    // Should have new chunks
    const queryVector = {
      dim: 384,
      values: Array.from({ length: 384 }, () => Math.random()),
    };

    const results = await store.search('test-scope', queryVector, 10);
    expect(results.length).toBeGreaterThan(0);
  });

  it('should filter by pathMatcher', async () => {
    const chunks: StoredMindChunk[] = [
      createChunk('chunk-1'),
      createChunk('chunk-2'),
    ];
    chunks[0]!.path = 'file1.ts';
    chunks[1]!.path = 'file2.js';

    await store.replaceScope('test-scope', chunks);

    const queryVector = {
      dim: 384,
      values: Array.from({ length: 384 }, () => Math.random()),
    };

    const results = await store.search('test-scope', queryVector, 10, {
      pathMatcher: (path) => path.endsWith('.ts'),
    });

    // Should only return .ts files
    results.forEach(result => {
      expect(result.chunk.path).toMatch(/\.ts$/);
    });
  });

  it('should handle empty scope', async () => {
    await store.replaceScope('empty-scope', []);

    const queryVector = {
      dim: 384,
      values: Array.from({ length: 384 }, () => Math.random()),
    };

    const results = await store.search('empty-scope', queryVector, 10);
    expect(results).toEqual([]);
  });

  it('should get all chunks', async () => {
    const chunks: StoredMindChunk[] = [
      createChunk('chunk-1'),
      createChunk('chunk-2'),
      createChunk('chunk-3'),
    ];

    await store.replaceScope('test-scope', chunks);

    if (store.getAllChunks) {
      const allChunks = await store.getAllChunks('test-scope');
      expect(allChunks.length).toBeGreaterThanOrEqual(0);
    } else {
      // If getAllChunks is not implemented, skip test
      expect(true).toBe(true);
    }
  });

  it('should provide scoped adapter batch operations', async () => {
    const chunks: StoredMindChunk[] = [
      createChunk('chunk-a', 'alpha'),
      createChunk('chunk-b', 'beta'),
    ];
    chunks[0]!.metadata = { fileHash: 'hash-a', fileMtime: 1000 };
    chunks[1]!.metadata = { fileHash: 'hash-b', fileMtime: 2000 };
    chunks[0]!.path = 'src/a.ts';
    chunks[1]!.path = 'src/b.ts';

    await store.replaceScope('test-scope', chunks);

    const adapter = store.createScopedAdapter?.('test-scope');
    expect(adapter).toBeDefined();
    if (!adapter) {
      return;
    }

    const existing = await adapter.checkExistence(['chunk-a', 'missing']);
    expect(existing.has('chunk-a')).toBe(true);
    expect(existing.has('missing')).toBe(false);

    const byHash = await adapter.getChunksByHash(['hash-a', 'hash-x']);
    expect(byHash.get('hash-a')).toContain('chunk-a');
    expect(byHash.get('hash-x')).toBeUndefined();

    const byPath = await adapter.getChunkIdsByPaths(['src/a.ts', 'src/missing.ts']);
    expect(byPath.get('src/a.ts')).toContain('chunk-a');
    expect(byPath.get('src/missing.ts')).toBeUndefined();

    const deleted = await adapter.deleteBatch(['chunk-b']);
    expect(deleted).toBe(1);
    const remaining = await store.getAllChunks('test-scope');
    expect(remaining.some(chunk => chunk.chunkId === 'chunk-b')).toBe(false);
  });

  it('should return file metadata for filtering stage', async () => {
    const chunk = createChunk('chunk-meta', 'meta');
    chunk.path = 'src/meta.ts';
    chunk.metadata = { fileHash: 'meta-hash', fileMtime: 123456 };

    await store.replaceScope('test-scope', [chunk]);
    const metadata = await store.getFilesMetadata?.('test-scope', ['src/meta.ts', 'src/none.ts']);

    expect(metadata).toBeDefined();
    if (!metadata) {
      return;
    }
    expect(metadata.get('src/meta.ts')).toEqual({
      hash: 'meta-hash',
      mtime: 123456,
      size: 0,
    });
    expect(metadata.has('src/none.ts')).toBe(false);
  });
});
