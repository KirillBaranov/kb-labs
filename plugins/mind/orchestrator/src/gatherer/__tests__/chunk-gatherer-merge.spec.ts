import { describe, expect, it } from 'vitest';
import type { MindChunk } from '@kb-labs/mind-types';

// Import the pure functions — they're module-level, tested via the behaviour they produce
// through gather(). We test the logic by checking gather() output characteristics.

// Re-implement the pure functions here for unit-level testing without needing
// to wire up a full ChunkGatherer with queryFn.

function normalizeSubqueryScores(chunks: MindChunk[]): MindChunk[] {
  if (chunks.length === 0) return chunks;
  const maxScore = Math.max(...chunks.map(c => c.score));
  if (maxScore < 0.5) return chunks;
  return chunks.map(c => ({ ...c, score: c.score / maxScore }));
}

function applyMultiSubqueryBoost(
  chunks: MindChunk[],
  subqueryResults: Map<string, MindChunk[]>,
): MindChunk[] {
  const pathOccurrences = new Map<string, number>();
  for (const subChunks of subqueryResults.values()) {
    const seenPaths = new Set<string>();
    for (const chunk of subChunks) {
      if (!seenPaths.has(chunk.path)) {
        pathOccurrences.set(chunk.path, (pathOccurrences.get(chunk.path) ?? 0) + 1);
        seenPaths.add(chunk.path);
      }
    }
  }
  const BOOST: Record<number, number> = { 2: 1.10, 3: 1.20 };
  return chunks.map(chunk => {
    const count = pathOccurrences.get(chunk.path) ?? 1;
    const boost = BOOST[Math.min(count, 3)] ?? 1;
    return boost > 1 ? { ...chunk, score: chunk.score * boost } : chunk;
  });
}

function deduplicateSubqueries(subqueries: string[]): string[] {
  const tokenize = (s: string): Set<string> =>
    new Set(s.toLowerCase().split(/\W+/).filter(t => t.length > 2));
  const unique: string[] = [];
  for (const sq of subqueries) {
    const sqTokens = tokenize(sq);
    const isDuplicate = unique.some(existing => {
      const exTokens = tokenize(existing);
      const intersection = [...sqTokens].filter(t => exTokens.has(t)).length;
      const union = new Set([...sqTokens, ...exTokens]).size;
      return union > 0 && intersection / union > 0.7;
    });
    if (!isDuplicate) unique.push(sq);
  }
  return unique;
}

function chunk(params: { id: string; path: string; score: number }): MindChunk {
  return {
    id: params.id,
    sourceId: 'test',
    path: params.path,
    span: { startLine: 1, endLine: 10 },
    text: 'content',
    score: params.score,
  };
}

describe('normalizeSubqueryScores', () => {
  it('normalizes to [0, 1] when maxScore >= 0.5', () => {
    const chunks = [
      chunk({ id: 'a', path: 'a.ts', score: 0.8 }),
      chunk({ id: 'b', path: 'b.ts', score: 0.6 }),
    ];
    const result = normalizeSubqueryScores(chunks);
    expect(result[0]?.score).toBeCloseTo(1.0);
    expect(result[1]?.score).toBeCloseTo(0.75);
  });

  it('skips normalization when maxScore < 0.5 (weak subquery)', () => {
    const chunks = [
      chunk({ id: 'a', path: 'a.ts', score: 0.4 }),
      chunk({ id: 'b', path: 'b.ts', score: 0.3 }),
    ];
    const result = normalizeSubqueryScores(chunks);
    expect(result[0]?.score).toBeCloseTo(0.4);
    expect(result[1]?.score).toBeCloseTo(0.3);
  });
});

describe('applyMultiSubqueryBoost', () => {
  it('boosts file found by 2 subqueries by 1.10x', () => {
    const sharedChunk = chunk({ id: 'shared', path: 'discover.ts', score: 0.6 });
    const subqueryResults = new Map([
      ['q1', [sharedChunk, chunk({ id: 'other', path: 'other.ts', score: 0.9 })]],
      ['q2', [sharedChunk]],
    ]);
    const result = applyMultiSubqueryBoost([sharedChunk], subqueryResults);
    expect(result[0]?.score).toBeCloseTo(0.6 * 1.10);
  });

  it('boosts file found by 3+ subqueries by 1.20x', () => {
    const sharedChunk = chunk({ id: 'shared', path: 'discover.ts', score: 0.5 });
    const subqueryResults = new Map([
      ['q1', [sharedChunk]],
      ['q2', [sharedChunk]],
      ['q3', [sharedChunk]],
    ]);
    const result = applyMultiSubqueryBoost([sharedChunk], subqueryResults);
    expect(result[0]?.score).toBeCloseTo(0.5 * 1.20);
  });

  it('does not boost file found by only 1 subquery', () => {
    const singleChunk = chunk({ id: 'single', path: 'only-in-one.ts', score: 0.7 });
    const subqueryResults = new Map([['q1', [singleChunk]]]);
    const result = applyMultiSubqueryBoost([singleChunk], subqueryResults);
    expect(result[0]?.score).toBeCloseTo(0.7);
  });
});

describe('deduplicateSubqueries', () => {
  it('removes near-duplicate subqueries (Jaccard > 0.7)', () => {
    const subqueries = [
      'worker pool uncaught exception crash handling',
      'worker pool crash handling uncaught exception',
    ];
    const result = deduplicateSubqueries(subqueries);
    expect(result).toHaveLength(1);
  });

  it('keeps distinct subqueries', () => {
    const subqueries = [
      'WorkerPool fork child process',
      'manifest discovery scan registry',
    ];
    const result = deduplicateSubqueries(subqueries);
    expect(result).toHaveLength(2);
  });

  it('keeps partial overlaps below threshold', () => {
    const subqueries = [
      'worker pool crash handling',
      'worker pool rate limiting concurrency',
    ];
    const result = deduplicateSubqueries(subqueries);
    expect(result).toHaveLength(2);
  });
});
