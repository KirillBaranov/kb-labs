/**
 * Reciprocal Rank Fusion (RRF) with intent-adaptive weights.
 *
 * Fuses ranked lists by `weight * 1/(k + rank)`. Weights shift the balance
 * between the semantic (vector) and keyword (BM25) lists based on query intent.
 */

import type { Ranked } from './bm25';

export type QueryIntent = 'lookup' | 'concept' | 'architecture';

export interface WeightedList {
  ranked: Ranked[];
  weight: number;
}

/** Vector/BM25 weighting per intent (vector favored for meaning, BM25 for exact terms). */
export function intentWeights(intent?: QueryIntent): { vector: number; bm25: number } {
  switch (intent) {
    case 'lookup':
      return { vector: 0.4, bm25: 0.6 }; // exact symbol lookups lean keyword
    case 'architecture':
      return { vector: 0.6, bm25: 0.4 };
    case 'concept':
    default:
      return { vector: 0.7, bm25: 0.3 };
  }
}

export function rrfFuse(lists: WeightedList[], k: number): Ranked[] {
  const fused = new Map<string, number>();

  for (const { ranked, weight } of lists) {
    ranked.forEach((item, idx) => {
      const rank = idx + 1;
      const contribution = weight * (1 / (k + rank));
      fused.set(item.id, (fused.get(item.id) ?? 0) + contribution);
    });
  }

  return [...fused.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}
