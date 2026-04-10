import { describe, expect, it } from 'vitest';
import { classifySubqueryWeights, rerankGatheredChunks } from '../chunk-gatherer';
import type { MindChunk } from '@kb-labs/mind-types';

function chunk(params: {
  id: string;
  path: string;
  text: string;
  score: number;
}): MindChunk {
  return {
    id: params.id,
    sourceId: 'codebase',
    path: params.path,
    span: { startLine: 1, endLine: 10 },
    text: params.text,
    score: params.score,
  };
}

describe('rerankGatheredChunks', () => {
  it('boosts code chunk with exact technical identifier in thinking mode', () => {
    const input: MindChunk[] = [
      chunk({
        id: 'doc',
        path: 'kb-labs-mind/docs/guide.md',
        text: 'General overview for policies.',
        score: 1.0,
      }),
      chunk({
        id: 'code',
        path: 'kb-labs-mind/packages/mind-engine/src/search/conflicts.ts',
        text: 'maxLosersPerTopic: number; penalty: number;',
        score: 0.8,
      }),
    ];

    const output = rerankGatheredChunks(
      input,
      'conflict policy maxLosersPerTopic penalty',
      'thinking',
    );
    expect(output[0]?.path).toContain('/src/search/conflicts.ts');
  });

  it('keeps non-technical query order untouched', () => {
    const input: MindChunk[] = [
      chunk({
        id: 'a',
        path: 'kb-labs-mind/docs/a.md',
        text: 'Overview',
        score: 0.7,
      }),
      chunk({
        id: 'b',
        path: 'kb-labs-mind/packages/mind-engine/src/index.ts',
        text: 'Implementation details',
        score: 0.6,
      }),
    ];

    const output = rerankGatheredChunks(input, 'high level overview please', 'thinking');
    expect(output[0]?.id).toBe('a');
    expect(output[1]?.id).toBe('b');
  });

  it('demotes plan docs vs ADR for architecture queries', () => {
    const input: MindChunk[] = [
      chunk({
        id: 'plan',
        path: 'kb-labs-mind/docs/rag-improvements-plan.md',
        text: 'Improvement plan draft',
        score: 1.0,
      }),
      chunk({
        id: 'adr',
        path: 'kb-labs-mind/docs/adr/0033-adaptive-search-weights.md',
        text: 'Adaptive search architecture and weights.',
        score: 0.82,
      }),
    ];

    const output = rerankGatheredChunks(
      input,
      'How does hybrid search architecture work?',
      'thinking',
    );
    expect(output[0]?.path).toContain('/docs/adr/0033-adaptive-search-weights.md');
  });
});

describe('classifySubqueryWeights', () => {
  it('prefers keyword for lookup-like technical query', () => {
    const weights = classifySubqueryWeights('What is VectorStore interface and methods?');
    expect(weights.keyword).toBeGreaterThan(weights.vector);
  });

  it('prefers vector for conceptual query', () => {
    const weights = classifySubqueryWeights('How does hybrid search architecture work?');
    expect(weights.vector).toBeGreaterThan(weights.keyword);
  });

  it('prefers keyword for CLI command query', () => {
    const weights = classifySubqueryWeights('Which stats are returned by rag-index command');
    expect(weights.keyword).toBeGreaterThan(weights.vector);
  });
});
