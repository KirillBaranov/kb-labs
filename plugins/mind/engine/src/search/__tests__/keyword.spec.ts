import { describe, it, expect } from 'vitest';
import { keywordSearch } from '../keyword';
import type { StoredMindChunk } from '../../vector-store/vector-store';

function createChunk(
  chunkId: string,
  text: string,
  path: string = 'test.ts',
): StoredMindChunk {
  return {
    chunkId,
    scopeId: 'test-scope',
    sourceId: 'test-source',
    path,
    span: { startLine: 1, endLine: 2 },
    text,
    metadata: {},
    embedding: { dim: 1536, values: [] },
  };
}

describe('keywordSearch', () => {
  it('should find chunks containing query terms', () => {
    const chunks = [
      createChunk('1', 'function test example'),
      createChunk('2', 'another example function'),
      createChunk('3', 'different content'),
    ];

    const results = keywordSearch(chunks, 'test function', 10);

    expect(results.length).toBeGreaterThan(0);
    // Should find chunks with 'test' or 'function'
    const foundChunkIds = new Set(results.map(r => r.chunk.chunkId));
    expect(foundChunkIds.has('1')).toBe(true);
    expect(foundChunkIds.has('2')).toBe(true);
  });

  it('should rank results by relevance', () => {
    const chunks = [
      createChunk('1', 'test test test'), // High frequency
      createChunk('2', 'test'),
      createChunk('3', 'other content'),
    ];

    const results = keywordSearch(chunks, 'test', 10);

    // Chunk with higher frequency should rank higher
    expect(results.length).toBeGreaterThan(0);
    if (results.length >= 2 && results[0] && results[1]) {
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
    }
  });

  it('should respect limit', () => {
    const chunks = Array.from({ length: 20 }, (_, i) =>
      createChunk(`chunk-${i}`, `test content ${i}`),
    );

    const results = keywordSearch(chunks, 'test', 5);

    expect(results.length).toBeLessThanOrEqual(5);
  });

  it('should handle empty query', () => {
    const chunks = [createChunk('1', 'test content')];

    const results = keywordSearch(chunks, '', 10);

    expect(results).toEqual([]);
  });

  it('should handle empty chunks', () => {
    const results = keywordSearch([], 'test', 10);

    expect(results).toEqual([]);
  });

  it('should filter by pathMatcher if provided', () => {
    const chunks = [
      createChunk('1', 'test', 'file1.ts'),
      createChunk('2', 'test', 'file2.ts'),
      createChunk('3', 'test', 'file3.js'),
    ];

    const results = keywordSearch(chunks, 'test', 10, {
      pathMatcher: (path) => path.endsWith('.ts'),
    });

    // Should only return .ts files
    results.forEach(result => {
      expect(result.chunk.path).toMatch(/\.ts$/);
    });
  });
});

