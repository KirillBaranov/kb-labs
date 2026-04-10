import { describe, expect, it } from 'vitest';
import { AgentQueryOrchestrator } from '../orchestrator';
import type { QueryFn } from '../gatherer/chunk-gatherer';

function createQueryFn(metadata: Record<string, unknown>): QueryFn {
  return async ({ text }) => ({
    chunks: [
      {
        id: `chunk-${text}`,
        sourceId: 'docs',
        path: 'docs/api.md',
        span: { startLine: 1, endLine: 5 },
        text: `chunk for ${text}`,
        score: 0.91,
        metadata: { kind: 'docs' },
      },
    ],
    metadata,
  });
}

function baseRetrievalMetadata(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    retrievalProfile: 'instant',
    freshnessApplied: true,
    boostedCandidates: 0,
    stalenessLevel: 'fresh',
    conflictsDetected: 0,
    conflictTopics: 0,
    conflictPolicy: 'freshness-first',
    confidence: 0.91,
    complete: true,
    recoverable: false,
    failClosed: false,
    indexRevision: 'rev-1',
    engineConfigHash: 'cfg-1',
    sourcesDigest: 'src-1',
    ...overrides,
  };
}

describe('AgentQueryOrchestrator context consistency', () => {
  it('uses cache on valid context', async () => {
    const orchestrator = new AgentQueryOrchestrator();
    let calls = 0;
    const queryFn: QueryFn = async (options) => {
      calls += 1;
      return createQueryFn(baseRetrievalMetadata())(options);
    };

    const options = {
      cwd: process.cwd(),
      scopeId: 'core',
      text: 'Find API',
      mode: 'instant' as const,
      indexRevision: 'rev-1',
      engineConfigHash: 'cfg-1',
      sourcesDigest: 'src-1',
    };

    const first = await orchestrator.query(options, queryFn);
    expect('error' in first).toBe(false);

    const second = await orchestrator.query(options, queryFn);
    expect('error' in second).toBe(false);
    expect(calls).toBe(1);
    expect(orchestrator.getCacheStats().size).toBe(1);
  });

  it('fails closed and invalidates scope cache on indexRevision mismatch', async () => {
    const orchestrator = new AgentQueryOrchestrator();
    const scopeId = 'core';

    const warmup = await orchestrator.query(
      {
        cwd: process.cwd(),
        scopeId,
        text: 'warmup',
        mode: 'instant',
        indexRevision: 'rev-1',
        engineConfigHash: 'cfg-1',
        sourcesDigest: 'src-1',
      },
      createQueryFn(baseRetrievalMetadata()),
    );
    expect('error' in warmup).toBe(false);
    expect(orchestrator.getCacheStats().size).toBe(1);

    const mismatch = await orchestrator.query(
      {
        cwd: process.cwd(),
        scopeId,
        text: 'mismatch-revision',
        mode: 'instant',
        indexRevision: 'rev-2',
        engineConfigHash: 'cfg-1',
        sourcesDigest: 'src-1',
      },
      createQueryFn(baseRetrievalMetadata()),
    );

    expect('error' in mismatch).toBe(true);
    if ('error' in mismatch) {
      expect(mismatch.error.code).toBe('INDEX_NOT_FOUND');
      expect(mismatch.error.recoverable).toBe(true);
      expect(mismatch.error.message).toContain('INDEX_CONTEXT_MISMATCH');
    }
    expect(orchestrator.getCacheStats().size).toBe(0);
  });

  it('fails closed on engineConfigHash mismatch', async () => {
    const orchestrator = new AgentQueryOrchestrator();

    const result = await orchestrator.query(
      {
        cwd: process.cwd(),
        scopeId: 'core',
        text: 'mismatch-engine-hash',
        mode: 'instant',
        indexRevision: 'rev-1',
        engineConfigHash: 'cfg-2',
        sourcesDigest: 'src-1',
      },
      createQueryFn(baseRetrievalMetadata()),
    );

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.code).toBe('INDEX_NOT_FOUND');
      expect(result.error.message).toContain('INDEX_CONTEXT_MISMATCH');
    }
  });

  it('fails closed on sourcesDigest mismatch', async () => {
    const orchestrator = new AgentQueryOrchestrator();

    const result = await orchestrator.query(
      {
        cwd: process.cwd(),
        scopeId: 'core',
        text: 'mismatch-sources-digest',
        mode: 'instant',
        indexRevision: 'rev-1',
        engineConfigHash: 'cfg-1',
        sourcesDigest: 'src-2',
      },
      createQueryFn(baseRetrievalMetadata()),
    );

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.code).toBe('INDEX_NOT_FOUND');
      expect(result.error.message).toContain('INDEX_CONTEXT_MISMATCH');
    }
  });
});
