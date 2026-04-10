/**
 * @module @kb-labs/core-platform/noop/adapters/vector-store
 * In-memory vector store implementation.
 */

import type {
  IVectorStore,
  VectorRecord,
  VectorSearchResult,
  VectorFilter,
} from '../../adapters/vector-store.js';

/**
 * Simple cosine similarity calculation.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {return 0;}

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const aVal = a[i] ?? 0;
    const bVal = b[i] ?? 0;
    dotProduct += aVal * bVal;
    normA += aVal * aVal;
    normB += bVal * bVal;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Check if record matches filter.
 */
function matchesFilter(record: VectorRecord, filter: VectorFilter): boolean {
  const value = record.metadata?.[filter.field];

  switch (filter.operator) {
    case 'eq':
      return value === filter.value;
    case 'ne':
      return value !== filter.value;
    case 'gt':
      return typeof value === 'number' && value > (filter.value as number);
    case 'gte':
      return typeof value === 'number' && value >= (filter.value as number);
    case 'lt':
      return typeof value === 'number' && value < (filter.value as number);
    case 'lte':
      return typeof value === 'number' && value <= (filter.value as number);
    case 'in':
      return Array.isArray(filter.value) && filter.value.includes(value);
    case 'nin':
      return Array.isArray(filter.value) && !filter.value.includes(value);
    default:
      return true;
  }
}

/**
 * In-memory vector store.
 * Suitable for testing and development.
 */
export class MemoryVectorStore implements IVectorStore {
  private vectors = new Map<string, VectorRecord>();

  async search(
    query: number[],
    limit: number,
    filter?: VectorFilter
  ): Promise<VectorSearchResult[]> {
    const results: VectorSearchResult[] = [];

    for (const record of this.vectors.values()) {
      if (filter && !matchesFilter(record, filter)) {
        continue;
      }

      const score = cosineSimilarity(query, record.vector);
      results.push({
        id: record.id,
        score,
        metadata: record.metadata,
      });
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async upsert(vectors: VectorRecord[]): Promise<void> {
    for (const vector of vectors) {
      this.vectors.set(vector.id, vector);
    }
  }

  async delete(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.vectors.delete(id);
    }
  }

  async count(): Promise<number> {
    return this.vectors.size;
  }
}
