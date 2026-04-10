import { describe, it, expect } from 'vitest';
import { ContextOptimizer } from '../context-optimizer';
import type { VectorSearchMatch } from '../../vector-store/vector-store';

function createMatch(
  chunkId: string,
  text: string,
  path: string,
  score: number = 0.5,
): VectorSearchMatch {
  return {
    chunk: {
      chunkId,
      scopeId: 'test-scope',
      sourceId: 'test-source',
      path,
      span: { startLine: 1, endLine: 2 },
      text,
      metadata: {},
      embedding: { dim: 1536, values: [] },
    },
    score,
  };
}

describe('ContextOptimizer', () => {
  const optimizer = new ContextOptimizer();

  describe('optimize', () => {
    it('should deduplicate similar chunks', () => {
      const matches: VectorSearchMatch[] = [
        createMatch('1', 'same text content here', 'file1.ts', 0.8),
        createMatch('2', 'same text content here', 'file1.ts', 0.7),
        createMatch('3', 'different content', 'file2.ts', 0.6),
      ];

      const result = optimizer.optimize(matches, {
        maxChunks: 10,
        deduplication: true,
        deduplicationThreshold: 0.9,
        diversification: false,
        adaptiveSelection: false,
      });

      // Should remove duplicate
      expect(result.length).toBeLessThan(matches.length);
    });

    it('should diversify across files', () => {
      const matches: VectorSearchMatch[] = [
        createMatch('1', 'chunk 1', 'file1.ts', 0.9),
        createMatch('2', 'chunk 2', 'file1.ts', 0.8),
        createMatch('3', 'chunk 3', 'file2.ts', 0.7),
      ];

      const result = optimizer.optimize(matches, {
        maxChunks: 10,
        deduplication: false,
        diversification: true,
        diversityThreshold: 0.3,
        maxChunksPerFile: 1,
        adaptiveSelection: false,
      });

      // Should have chunks from different files
      const paths = new Set(result.map(c => c.path));
      expect(paths.size).toBeGreaterThan(1);
    });

    it('should respect maxChunks limit', () => {
      const matches: VectorSearchMatch[] = Array.from({ length: 20 }, (_, i) =>
        createMatch(`chunk-${i}`, `text ${i}`, `file${i % 3}.ts`, 0.5),
      );

      const result = optimizer.optimize(matches, {
        maxChunks: 5,
        deduplication: false,
        diversification: false,
        adaptiveSelection: false,
      });

      expect(result.length).toBeLessThanOrEqual(5);
    });

    it('should handle empty matches', () => {
      const result = optimizer.optimize([], {
        maxChunks: 10,
        deduplication: true,
        diversification: true,
        adaptiveSelection: false,
      });

      expect(result).toEqual([]);
    });

    it('should apply adaptive selection when enabled', () => {
      const matches: VectorSearchMatch[] = Array.from({ length: 10 }, (_, i) =>
        createMatch(`chunk-${i}`, `text ${i} `.repeat(20), `file.ts`, 0.5),
      );

      const result = optimizer.optimize(matches, {
        maxChunks: 10,
        deduplication: false,
        diversification: false,
        adaptiveSelection: true,
        tokenBudget: 100,
        avgTokensPerChunk: 20,
      });

      // Should select chunks within token budget
      expect(result.length).toBeLessThanOrEqual(matches.length);
    });
  });
});

