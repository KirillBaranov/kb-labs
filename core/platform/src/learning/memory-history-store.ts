import { createHash } from 'node:crypto';
import type { HistoryFindOptions, HistoryRecord, IHistoryStore } from './history-store.js';

/**
 * In-memory history store with basic similarity search.
 * Intended as a fallback when persistent storage is not configured.
 */
export class MemoryHistoryStore implements IHistoryStore {
  private readonly entries: HistoryRecord[] = [];
  private readonly maxEntries: number;

  constructor(maxEntries: number = 10_000) {
    this.maxEntries = maxEntries;
  }

  async save(record: HistoryRecord): Promise<void> {
    this.entries.push(record);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  async find(options: HistoryFindOptions): Promise<HistoryRecord[]> {
    const { scopeId, queryHash, queryVector, limit = 10 } = options;

    let results = this.entries.filter((entry) => entry.scopeId === scopeId);

    if (queryHash) {
      results = results.filter((entry) => entry.queryHash === queryHash);
    }

    if (queryVector && queryVector.length > 0) {
      results = results
        .map((entry) => {
          const similarity = entry.queryVector ? this.cosineSimilarity(queryVector, entry.queryVector) : 0;
          return { entry, similarity };
        })
        .filter((item) => item.similarity > 0.7)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit)
        .map((item) => item.entry);
    } else {
      results = results.slice(0, limit);
    }

    return results;
  }

  async popular(scopeId: string, limit: number = 20): Promise<Array<{ query: string; count: number }>> {
    const counts = new Map<string, number>();
    for (const entry of this.entries) {
      if (entry.scopeId !== scopeId) {continue;}
      const count = counts.get(entry.query) ?? 0;
      counts.set(entry.query, count + 1);
    }
    return Array.from(counts.entries())
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  async saveReasoningPlan(record: HistoryRecord): Promise<void> {
    const targetHash = record.queryHash ?? createHash('sha256').update(record.query.toLowerCase().trim()).digest('hex');
    const matches = this.entries.filter((entry) => entry.scopeId === record.scopeId && entry.queryHash === targetHash);
    if (matches.length === 0) {
      await this.save({ ...record, queryHash: targetHash });
      return;
    }
    for (const entry of matches) {
      entry.reasoningPlan = record.reasoningPlan;
    }
  }

  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {return 0;}
    let dot = 0;
    let norm1 = 0;
    let norm2 = 0;
    for (let i = 0; i < vec1.length; i++) {
      dot += vec1[i]! * vec2[i]!;
      norm1 += vec1[i]! * vec1[i]!;
      norm2 += vec2[i]! * vec2[i]!;
    }
    const denom = Math.sqrt(norm1) * Math.sqrt(norm2);
    return denom === 0 ? 0 : dot / denom;
  }
}

