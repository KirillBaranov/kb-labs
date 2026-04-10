import { describe, expect, it } from 'vitest';
import { boostExactIdentifiers } from '../adaptive-hybrid';
import type { VectorSearchMatch, StoredMindChunk } from '../../vector-store/vector-store';

function createMatch(params: {
  chunkId: string;
  path: string;
  text: string;
  score: number;
}): VectorSearchMatch {
  const chunk: StoredMindChunk = {
    chunkId: params.chunkId,
    scopeId: 'default',
    sourceId: 'codebase',
    path: params.path,
    span: { startLine: 1, endLine: 10 },
    text: params.text,
    metadata: {},
    embedding: { dim: 3, values: [0, 0, 0] },
  };
  return { chunk, score: params.score };
}

describe('boostExactIdentifiers', () => {
  it('prioritizes code chunks with exact identifier match over docs', () => {
    const matches: VectorSearchMatch[] = [
      createMatch({
        chunkId: 'doc-1',
        path: 'kb-labs-mind/docs/guide.md',
        text: 'This guide explains conflict policy in general terms.',
        score: 1.0,
      }),
      createMatch({
        chunkId: 'code-1',
        path: 'kb-labs-mind/packages/mind-engine/src/search/conflicts.ts',
        text: 'maxLosersPerTopic: number; penalty: number;',
        score: 0.8,
      }),
    ];

    const boosted = boostExactIdentifiers(matches, ['maxLosersPerTopic']);
    expect(boosted[0]?.chunk.path).toContain('/src/search/conflicts.ts');
  });

  it('keeps ordering stable when no identifier evidence exists', () => {
    const matches: VectorSearchMatch[] = [
      createMatch({
        chunkId: 'a',
        path: 'kb-labs-mind/packages/mind-engine/src/index.ts',
        text: 'Indexing pipeline orchestration',
        score: 0.6,
      }),
      createMatch({
        chunkId: 'b',
        path: 'kb-labs-mind/packages/mind-engine/src/search/hybrid.ts',
        text: 'Hybrid search combines channels.',
        score: 0.5,
      }),
    ];

    const boosted = boostExactIdentifiers(matches, ['NonExistingIdentifier']);
    expect(boosted[0]?.chunk.chunkId).toBe('a');
    expect(boosted[1]?.chunk.chunkId).toBe('b');
  });

  it('matches identifiers against hyphenated file paths', () => {
    const matches: VectorSearchMatch[] = [
      createMatch({
        chunkId: 'doc',
        path: 'kb-labs-agents/docs/adr/0004-progress-tracking-and-stuck-detection.md',
        text: 'Test: "What is the VectorStore interface?"',
        score: 1.0,
      }),
      createMatch({
        chunkId: 'code',
        path: 'kb-labs-mind/packages/mind-engine/src/vector-store/vector-store.ts',
        text: 'export interface VectorStore { search(): Promise<void>; }',
        score: 0.65,
      }),
    ];

    const boosted = boostExactIdentifiers(matches, ['VectorStore']);
    expect(boosted[0]?.chunk.path).toContain('/vector-store/vector-store.ts');
  });
});
