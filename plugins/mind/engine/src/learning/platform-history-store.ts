import { createHash } from 'node:crypto';
import type { IHistoryStore, HistoryRecord } from '@kb-labs/sdk';
import type { QueryHistoryEntry, QueryHistoryStore, ReasoningPlanMetadata } from './query-history';

/**
 * Adapter to bridge core-platform IHistoryStore to Mind QueryHistoryStore interface.
 */
export class PlatformHistoryStoreAdapter implements QueryHistoryStore {
  constructor(private readonly store: IHistoryStore) {}

  async save(entry: QueryHistoryEntry): Promise<void> {
    await this.store.save(this.toRecord(entry));
  }

  async findByQuery(queryText: string, scopeId: string): Promise<QueryHistoryEntry[]> {
    const queryHash = this.hash(queryText);
    const records = await this.store.find({ scopeId, queryHash });
    return records.map((r) => this.toEntry(r));
  }

  async findBySimilarQuery(queryVector: number[], scopeId: string, limit: number = 10): Promise<QueryHistoryEntry[]> {
    const records = await this.store.find({ scopeId, queryVector, limit });
    return records.map((r) => this.toEntry(r));
  }

  async getPopularQueries(scopeId: string, limit: number = 20): Promise<Array<{ query: string; count: number }>> {
    return this.store.popular(scopeId, limit);
  }

  async saveReasoningPlan(metadata: ReasoningPlanMetadata): Promise<void> {
    const entry: QueryHistoryEntry = {
      queryId: this.generateId(metadata),
      queryText: metadata.plan.originalQuery,
      queryHash: metadata.queryHash,
      scopeId: metadata.scopeId,
      timestamp: Date.now(),
      resultChunkIds: [],
      topChunkIds: [],
      reasoningPlan: metadata,
    };
    if (this.store.saveReasoningPlan) {
      await this.store.saveReasoningPlan(this.toRecord(entry));
      return;
    }
    await this.store.save(this.toRecord(entry));
  }

  private toRecord(entry: QueryHistoryEntry): HistoryRecord {
    return {
      id: entry.queryId,
      query: entry.queryText,
      queryHash: entry.queryHash ?? this.hash(entry.queryText),
      scopeId: entry.scopeId,
      timestamp: entry.timestamp,
      resultChunkIds: entry.resultChunkIds,
      topChunkIds: entry.topChunkIds,
      reasoningPlan: entry.reasoningPlan,
      queryVector: entry.queryVector,
    };
  }

  private toEntry(record: HistoryRecord): QueryHistoryEntry {
    return {
      queryId: record.id,
      queryText: record.query,
      queryHash: record.queryHash,
      scopeId: record.scopeId,
      timestamp: record.timestamp,
      resultChunkIds: record.resultChunkIds,
      topChunkIds: record.topChunkIds,
      queryVector: record.queryVector,
      reasoningPlan: record.reasoningPlan as ReasoningPlanMetadata | undefined,
    };
  }

  private hash(text: string): string {
    return createHash('sha256').update(text.toLowerCase().trim()).digest('hex');
  }

  private generateId(metadata: ReasoningPlanMetadata): string {
    return createHash('sha256')
      .update(`${metadata.scopeId}:${metadata.queryHash}:${metadata.plan.originalQuery}:${Date.now()}`)
      .digest('hex')
      .substring(0, 16);
  }
}
