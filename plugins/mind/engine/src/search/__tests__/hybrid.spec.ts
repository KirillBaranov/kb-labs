import { describe, it, expect } from 'vitest';
import { hybridSearch } from '../hybrid';
import type { VectorSearchMatch, StoredMindChunk } from '../../vector-store/vector-store';
import type { EmbeddingVector } from '../../vector-store/vector-store';
import { keywordSearch } from '../keyword';

function createChunk(
  chunkId: string,
  text: string = 'test',
): StoredMindChunk {
  return {
    chunkId,
    scopeId: 'test-scope',
    sourceId: 'test-source',
    path: 'test.ts',
    span: { startLine: 1, endLine: 2 },
    text,
    metadata: {},
    embedding: { dim: 1536, values: [] },
  };
}

describe('hybridSearch', () => {
  it('should combine vector and keyword results', async () => {
    const allChunks: StoredMindChunk[] = [
      createChunk('1', 'vector result 1'),
      createChunk('2', 'vector result 2'),
      createChunk('3', 'vector result 3'),
      createChunk('4', 'keyword result 4'),
    ];

    const vectorSearch = async () => [
      { chunk: allChunks[0]!, score: 0.9 },
      { chunk: allChunks[1]!, score: 0.8 },
      { chunk: allChunks[2]!, score: 0.7 },
    ] as VectorSearchMatch[];

    const queryVector: EmbeddingVector = { dim: 1536, values: [] };

    const result = await hybridSearch(
      vectorSearch,
      keywordSearch,
      'test-scope',
      queryVector,
      'result',
      allChunks,
      5,
    );

    expect(result.length).toBeGreaterThan(0);
  });

  it('should respect limit', async () => {
    const allChunks: StoredMindChunk[] = Array.from({ length: 20 }, (_, i) =>
      createChunk(`chunk-${i}`, `test content ${i}`),
    );

    const vectorSearch = async () => 
      allChunks.slice(0, 10).map((chunk, i) => ({
        chunk,
        score: 0.9 - i * 0.1,
      })) as VectorSearchMatch[];

    const queryVector: EmbeddingVector = { dim: 1536, values: [] };

    const result = await hybridSearch(
      vectorSearch,
      keywordSearch,
      'test-scope',
      queryVector,
      'test',
      allChunks,
      5,
    );

    expect(result.length).toBeLessThanOrEqual(5);
  });

  it('should handle empty results', async () => {
    const vectorSearch = async () => [] as VectorSearchMatch[];
    const queryVector: EmbeddingVector = { dim: 1536, values: [] };

    const result = await hybridSearch(
      vectorSearch,
      keywordSearch,
      'test-scope',
      queryVector,
      'nonexistent',
      [],
      10,
    );

    expect(result).toEqual([]);
  });
});

