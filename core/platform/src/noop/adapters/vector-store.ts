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
const DEFAULT_NAMESPACE = '';

export class MemoryVectorStore implements IVectorStore {
  /** Records partitioned by namespace; default namespace is the empty string. */
  private namespaces = new Map<string, Map<string, VectorRecord>>();

  private partition(namespace?: string): Map<string, VectorRecord> {
    const key = namespace ?? DEFAULT_NAMESPACE;
    let partition = this.namespaces.get(key);
    if (!partition) {
      partition = new Map<string, VectorRecord>();
      this.namespaces.set(key, partition);
    }
    return partition;
  }

  async search(
    query: number[],
    limit: number,
    filter?: VectorFilter,
    namespace?: string
  ): Promise<VectorSearchResult[]> {
    const results: VectorSearchResult[] = [];

    for (const record of this.partition(namespace).values()) {
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

  async upsert(vectors: VectorRecord[], namespace?: string): Promise<void> {
    const partition = this.partition(namespace);
    for (const vector of vectors) {
      partition.set(vector.id, vector);
    }
  }

  async delete(ids: string[], namespace?: string): Promise<void> {
    const partition = this.partition(namespace);
    for (const id of ids) {
      partition.delete(id);
    }
  }

  async count(namespace?: string): Promise<number> {
    return this.partition(namespace).size;
  }

  async get(ids: string[], namespace?: string): Promise<VectorRecord[]> {
    const partition = this.partition(namespace);
    return ids
      .map((id) => partition.get(id))
      .filter((r): r is VectorRecord => r !== undefined);
  }

  async query(filter: VectorFilter, namespace?: string): Promise<VectorRecord[]> {
    const out: VectorRecord[] = [];
    for (const record of this.partition(namespace).values()) {
      if (matchesFilter(record, filter)) {
        out.push(record);
      }
    }
    return out;
  }
}
