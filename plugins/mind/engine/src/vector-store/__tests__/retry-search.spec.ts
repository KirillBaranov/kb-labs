/**
 * @module @kb-labs/mind-engine/vector-store/__tests__/retry-search.spec.ts
 * Tests for retry logic wired into LocalVectorStore.search and
 * PlatformVectorStoreAdapter.search.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalVectorStore } from '../local';
import { PlatformVectorStoreAdapter } from '../platform-adapter';
import type { StoredMindChunk, VectorSearchMatch } from '../vector-store';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEmbedding(dim = 4) {
  return { dim, values: Array.from({ length: dim }, () => Math.random()) };
}

function makeChunk(id: string): StoredMindChunk {
  return {
    chunkId: id,
    scopeId: 'scope-1',
    sourceId: 'src-1',
    path: 'file.ts',
    span: { startLine: 1, endLine: 5 },
    text: 'hello world',
    embedding: makeEmbedding(),
  };
}

function makeMatch(id: string): VectorSearchMatch {
  return { chunk: makeChunk(id), score: 0.9 };
}

/** Returns a transient ECONNREFUSED-like error. */
function transientError() {
  return Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' });
}

/** Returns a permanent (non-transient) error. */
function permanentError() {
  return new Error('invalid query');
}

// ---------------------------------------------------------------------------
// LocalVectorStore retry tests
// ---------------------------------------------------------------------------

describe('LocalVectorStore – search retry', () => {
  let store: LocalVectorStore;
  let innerSearch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Construct with a tiny delay so tests are still fast
    store = new LocalVectorStore({
      indexDir: '/fake/dir',
      retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5, jitter: 0 },
    });

    // Patch the private MindVectorStore instance's search method
    innerSearch = vi.fn();
    (store as any).store.search = innerSearch;
  });

  it('returns results immediately when search succeeds on the first try', async () => {
    const expected = [makeMatch('chunk-1')];
    innerSearch.mockResolvedValueOnce(expected);

    const result = await store.search('scope-1', makeEmbedding(), 5);

    expect(result).toEqual(expected);
    expect(innerSearch).toHaveBeenCalledTimes(1);
  });

  it('retries on a transient error and succeeds on the second attempt', async () => {
    const expected = [makeMatch('chunk-2')];
    innerSearch
      .mockRejectedValueOnce(transientError())
      .mockResolvedValueOnce(expected);

    const result = await store.search('scope-1', makeEmbedding(), 5);

    expect(result).toEqual(expected);
    expect(innerSearch).toHaveBeenCalledTimes(2);
  });

  it('retries up to maxAttempts then throws the last transient error', async () => {
    innerSearch.mockRejectedValue(transientError()); // always fails

    await expect(store.search('scope-1', makeEmbedding(), 5)).rejects.toMatchObject({
      code: 'ECONNREFUSED',
    });

    // maxAttempts = 3
    expect(innerSearch).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry on a permanent error and propagates it immediately', async () => {
    innerSearch.mockRejectedValueOnce(permanentError());

    await expect(store.search('scope-1', makeEmbedding(), 5)).rejects.toThrow('invalid query');

    // Must not retry – only 1 call
    expect(innerSearch).toHaveBeenCalledTimes(1);
  });

  it('respects custom maxAttempts', async () => {
    const customStore = new LocalVectorStore({
      indexDir: '/fake/dir',
      retry: { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 2, jitter: 0 },
    });
    const customSearch = vi.fn().mockRejectedValue(transientError());
    (customStore as any).store.search = customSearch;

    await expect(customStore.search('scope-1', makeEmbedding(), 5)).rejects.toThrow();
    expect(customSearch).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// PlatformVectorStoreAdapter retry tests
// ---------------------------------------------------------------------------

describe('PlatformVectorStoreAdapter – search retry', () => {
  let adapter: PlatformVectorStoreAdapter;
  let platformSearch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    platformSearch = vi.fn();

    const fakeVectorStore = {
      search: platformSearch,
      upsert: vi.fn(),
      delete: vi.fn(),
    };

    adapter = new PlatformVectorStoreAdapter({
      vectorStore: fakeVectorStore as any,
      retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5, jitter: 0 },
    });
  });

  it('returns mapped matches when the platform search succeeds on the first try', async () => {
    platformSearch.mockResolvedValueOnce([
      {
        id: 'scope-1:chunk-a',
        score: 0.85,
        metadata: {
          scopeId: 'scope-1',
          chunkId: 'chunk-a',
          sourceId: 'src-1',
          path: 'a.ts',
          span: { startLine: 1, endLine: 3 },
          text: 'foo',
        },
      },
    ]);

    const vector = makeEmbedding();
    const results = await adapter.search('scope-1', vector, 5);

    expect(results).toHaveLength(1);
    expect(results[0]!.chunk.chunkId).toBe('chunk-a');
    expect(results[0]!.score).toBe(0.85);
    expect(platformSearch).toHaveBeenCalledTimes(1);
  });

  it('retries on a transient HTTP 503 error and succeeds on the third attempt', async () => {
    const http503 = Object.assign(new Error('Service Unavailable'), { status: 503 });
    platformSearch
      .mockRejectedValueOnce(http503)
      .mockRejectedValueOnce(http503)
      .mockResolvedValueOnce([]);

    const results = await adapter.search('scope-1', makeEmbedding(), 5);

    expect(results).toEqual([]);
    expect(platformSearch).toHaveBeenCalledTimes(3);
  });

  it('retries up to maxAttempts then throws on persistent transient errors', async () => {
    platformSearch.mockRejectedValue(
      Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }),
    );

    await expect(adapter.search('scope-1', makeEmbedding(), 5)).rejects.toMatchObject({
      code: 'ETIMEDOUT',
    });

    expect(platformSearch).toHaveBeenCalledTimes(3); // maxAttempts = 3
  });

  it('does NOT retry on a permanent error', async () => {
    platformSearch.mockRejectedValueOnce(permanentError());

    await expect(adapter.search('scope-1', makeEmbedding(), 5)).rejects.toThrow('invalid query');

    expect(platformSearch).toHaveBeenCalledTimes(1);
  });

  it('applies sourceIds filter after successful retry', async () => {
    platformSearch
      .mockRejectedValueOnce(transientError())
      .mockResolvedValueOnce([
        {
          id: 'scope-1:chunk-keep',
          score: 0.9,
          metadata: {
            scopeId: 'scope-1',
            chunkId: 'chunk-keep',
            sourceId: 'wanted-src',
            path: 'b.ts',
            span: { startLine: 1, endLine: 2 },
            text: 'bar',
          },
        },
        {
          id: 'scope-1:chunk-drop',
          score: 0.8,
          metadata: {
            scopeId: 'scope-1',
            chunkId: 'chunk-drop',
            sourceId: 'other-src',
            path: 'c.ts',
            span: { startLine: 1, endLine: 2 },
            text: 'baz',
          },
        },
      ]);

    const results = await adapter.search('scope-1', makeEmbedding(), 10, {
      sourceIds: new Set(['wanted-src']),
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.chunk.chunkId).toBe('chunk-keep');
    expect(platformSearch).toHaveBeenCalledTimes(2);
  });
});
