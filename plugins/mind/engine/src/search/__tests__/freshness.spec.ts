import { describe, expect, it } from 'vitest';
import {
  applyFreshnessRanking,
  resolveRetrievalMode,
  type FreshnessConfig,
} from '../freshness';
import type { VectorSearchMatch } from '../../vector-store/vector-store';

const NOW = Date.parse('2026-02-14T12:00:00.000Z');

const config: FreshnessConfig = {
  enabled: true,
  docsWeight: 0.25,
  codeWeight: 0.1,
  trustWeight: 0.1,
  maxBoost: 0.3,
  staleThresholdHours: {
    soft: 72,
    hard: 168,
  },
};

function createMatch(params: {
  id: string;
  score: number;
  path: string;
  sourceKind?: string;
  fileMtime?: number;
  sourceTrust?: number;
  indexedAt?: number;
}): VectorSearchMatch {
  return {
    score: params.score,
    chunk: {
      chunkId: params.id,
      scopeId: 'scope',
      sourceId: 'source',
      path: params.path,
      span: { startLine: 1, endLine: 10 },
      text: 'chunk',
      embedding: { dim: 4, values: [0.1, 0.2, 0.3, 0.4] },
      metadata: {
        sourceKind: params.sourceKind,
        fileMtime: params.fileMtime,
        sourceTrust: params.sourceTrust,
        indexedAt: params.indexedAt,
      },
    },
  };
}

describe('freshness ranking', () => {
  it('prioritizes fresher docs over stale docs', () => {
    const staleDoc = createMatch({
      id: 'stale',
      score: 0.79,
      path: 'docs/guide-old.md',
      sourceKind: 'docs',
      fileMtime: NOW - 14 * 24 * 60 * 60 * 1000,
      sourceTrust: 0.7,
      indexedAt: NOW - 14 * 24 * 60 * 60 * 1000,
    });
    const freshDoc = createMatch({
      id: 'fresh',
      score: 0.75,
      path: 'docs/guide-new.md',
      sourceKind: 'docs',
      fileMtime: NOW - 2 * 60 * 60 * 1000,
      sourceTrust: 0.9,
      indexedAt: NOW - 2 * 60 * 60 * 1000,
    });

    const result = applyFreshnessRanking([staleDoc, freshDoc], config, 'thinking', NOW);

    expect(result.matches[0]?.chunk.chunkId).toBe('fresh');
    expect(result.diagnostics.applied).toBe(true);
    expect(result.diagnostics.boostedCandidates).toBe(2);
  });

  it('reports soft stale based on indexedAt threshold', () => {
    const softStale = createMatch({
      id: 'soft',
      score: 0.8,
      path: 'docs/soft.md',
      sourceKind: 'docs',
      fileMtime: NOW - 80 * 60 * 60 * 1000,
      indexedAt: NOW - 80 * 60 * 60 * 1000,
    });

    const result = applyFreshnessRanking([softStale], config, 'auto', NOW);
    expect(result.diagnostics.stalenessLevel).toBe('soft-stale');
  });

  it('falls back to auto for unknown mode', () => {
    expect(resolveRetrievalMode('invalid')).toBe('auto');
    expect(resolveRetrievalMode('instant')).toBe('instant');
  });
});
