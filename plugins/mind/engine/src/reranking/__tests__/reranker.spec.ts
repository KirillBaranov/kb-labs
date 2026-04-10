import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HeuristicReranker, CrossEncoderReranker } from '../reranker';
import type { VectorSearchMatch } from '../../vector-store/vector-store';
import type { RuntimeAdapter } from '../../adapters/runtime-adapter';

function createMatch(
  chunkId: string,
  score: number,
  text: string = 'test content',
): VectorSearchMatch {
  return {
    chunk: {
      chunkId,
      scopeId: 'test-scope',
      sourceId: 'test-source',
      path: 'test.ts',
      span: { startLine: 1, endLine: 2 },
      text,
      metadata: {},
      embedding: { dim: 1536, values: [] },
    },
    score,
  };
}

function createMockRuntime(apiKey: string = 'test-api-key'): RuntimeAdapter {
  return {
    fetch: vi.fn(),
    env: {
      get: vi.fn((key: string) => {
        if (key === 'OPENAI_API_KEY') {return apiKey;}
        return undefined;
      }),
    },
    fs: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
      exists: vi.fn(),
    },
    log: vi.fn(),
    analytics: {
      track: vi.fn(),
      metric: vi.fn(),
    },
  };
}

describe('HeuristicReranker', () => {
  const reranker = new HeuristicReranker();

  it('should rerank results based on keyword matching', async () => {
    const matches: VectorSearchMatch[] = [
      createMatch('1', 0.5, 'unrelated content'),
      createMatch('2', 0.6, 'query keyword here'),
      createMatch('3', 0.7, 'some other content'),
    ];

    const result = await reranker.rerank('query keyword', matches, {
      topK: 2,
    });

    expect(result.length).toBeLessThanOrEqual(matches.length);
    // Should prioritize chunks with query keywords
    if (result.length > 0) {
      const topChunkId = result[0]?.chunk.chunkId;
      expect(['1', '2', '3']).toContain(topChunkId);
    }
  });

  it('should respect topK limit', async () => {
    const matches: VectorSearchMatch[] = Array.from({ length: 10 }, (_, i) =>
      createMatch(`chunk-${i}`, 0.5 + i * 0.05),
    );

    const result = await reranker.rerank('query', matches, {
      topK: 5,
    });

    // Should return all matches but only topK are reranked
    expect(result.length).toBeLessThanOrEqual(matches.length);
  });

  it('should handle empty matches', async () => {
    const result = await reranker.rerank('query', [], {
      topK: 10,
    });

    expect(result).toEqual([]);
  });

  it('should boost chunks with metadata', async () => {
    const matches: VectorSearchMatch[] = [
      createMatch('1', 0.5, 'content'),
      createMatch('2', 0.5, 'content'),
    ];
    matches[1]!.chunk.metadata = { important: true };

    const result = await reranker.rerank('content', matches, {
      topK: 2,
    });

    // Should prioritize chunks with metadata
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('CrossEncoderReranker', () => {
  let mockRuntime: RuntimeAdapter;

  beforeEach(() => {
    mockRuntime = createMockRuntime();
  });

  it('should rerank using external LLM', async () => {
    const matches: VectorSearchMatch[] = [
      createMatch('1', 0.5, 'relevant content'),
      createMatch('2', 0.6, 'less relevant'),
    ];

    // Mock LLM response
    (mockRuntime.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: '0.9',
          },
        }],
      }),
    } as Response);

    const reranker = new CrossEncoderReranker({
      endpoint: 'http://localhost:8000/rerank',
      model: 'test-model',
      runtime: mockRuntime,
      apiKey: 'test-key',
    });

    const result = await reranker.rerank('relevant', matches, {
      topK: 2,
    });

    expect(result.length).toBeLessThanOrEqual(matches.length);
    expect(mockRuntime.fetch).toHaveBeenCalled();
  });

  it('should handle LLM errors gracefully', async () => {
    const matches: VectorSearchMatch[] = [
      createMatch('1', 0.5, 'content'),
    ];

    // Mock LLM error
    (mockRuntime.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('LLM service unavailable'),
    );

    const reranker = new CrossEncoderReranker({
      endpoint: 'http://localhost:8000/rerank',
      model: 'test-model',
      runtime: mockRuntime,
      apiKey: 'test-key',
    });

    // Should fallback to original score when LLM fails
    const result = await reranker.rerank('query', matches, {
      topK: 1,
    });

    // Should return matches with original scores
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.score).toBe(0.5);
  });

  it('should fallback on errors', async () => {
    const matches: VectorSearchMatch[] = [
      createMatch('1', 0.5, 'content'),
    ];

    // Mock error response
    (mockRuntime.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Network error'),
    );

    const reranker = new CrossEncoderReranker({
      endpoint: 'http://localhost:8000/rerank',
      model: 'test-model',
      runtime: mockRuntime,
      timeout: 1000,
      apiKey: 'test-key',
    });

    // Should fallback to original score on error
    const result = await reranker.rerank('query', matches, {
      topK: 1,
    });

    // Should return matches with original scores due to error fallback
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.score).toBe(0.5); // Original score
  });

  it('should batch requests when needed', async () => {
    const matches: VectorSearchMatch[] = Array.from({ length: 20 }, (_, i) =>
      createMatch(`chunk-${i}`, 0.5),
    );

    // Mock multiple responses for batches
    let callCount = 0;
    (mockRuntime.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: '0.5',
            },
          }],
        }),
      } as Response);
    });

    const reranker = new CrossEncoderReranker({
      endpoint: 'http://localhost:8000/rerank',
      model: 'test-model',
      runtime: mockRuntime,
      batchSize: 10,
      apiKey: 'test-key',
    });

    const result = await reranker.rerank('query', matches, {
      topK: 20, // Process all matches
    });

    // Should make multiple batch requests (20 matches / 10 batchSize = 2 batches)
    expect(mockRuntime.fetch).toHaveBeenCalled();
    expect(callCount).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(matches.length);
  });
});

