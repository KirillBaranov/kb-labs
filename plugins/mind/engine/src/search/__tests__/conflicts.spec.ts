import { describe, expect, it } from 'vitest';
import { applyConflictResolution, type ConflictConfig } from '../conflicts';
import type { VectorSearchMatch } from '../../vector-store/vector-store';

const config: ConflictConfig = {
  enabled: true,
  policy: 'freshness-first',
  maxLosersPerTopic: 3,
  penalty: 0.2,
};

function createMatch(params: {
  id: string;
  score: number;
  path: string;
  topicKey: string;
  sourceKind?: string;
  effectiveDate?: string;
  docVersion?: string;
  gitCommitTs?: number;
  fileMtime?: number;
  sourceTrust?: number;
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
        topicKey: params.topicKey,
        sourceKind: params.sourceKind ?? 'docs',
        effectiveDate: params.effectiveDate,
        docVersion: params.docVersion,
        gitCommitTs: params.gitCommitTs,
        fileMtime: params.fileMtime,
        sourceTrust: params.sourceTrust,
      },
    },
  };
}

describe('conflict resolution', () => {
  it('keeps fresh winner and penalizes older loser', () => {
    const oldDoc = createMatch({
      id: 'old',
      score: 0.82,
      path: 'docs/api-v1.md',
      topicKey: 'api',
      effectiveDate: '2024-01-01',
      docVersion: '1.0.0',
    });
    const newDoc = createMatch({
      id: 'new',
      score: 0.79,
      path: 'docs/api-v2.md',
      topicKey: 'api',
      effectiveDate: '2026-02-01',
      docVersion: '2.0.0',
    });

    const result = applyConflictResolution([oldDoc, newDoc], config, 'thinking');

    expect(result.matches[0]?.chunk.chunkId).toBe('new');
    expect(result.diagnostics.conflictsDetected).toBe(1);
    expect(result.diagnostics.penalizedChunks).toBe(1);
  });

  it('uses trust as deterministic tie-breaker', () => {
    const a = createMatch({
      id: 'a',
      score: 0.7,
      path: 'docs/runbook-a.md',
      topicKey: 'runbook',
      effectiveDate: '2026-01-01',
      docVersion: '1.0.0',
      sourceTrust: 0.4,
    });
    const b = createMatch({
      id: 'b',
      score: 0.69,
      path: 'docs/runbook-b.md',
      topicKey: 'runbook',
      effectiveDate: '2026-01-01',
      docVersion: '1.0.0',
      sourceTrust: 0.9,
    });

    const result = applyConflictResolution([a, b], config, 'auto');
    expect(result.matches[0]?.chunk.chunkId).toBe('b');
  });
});
