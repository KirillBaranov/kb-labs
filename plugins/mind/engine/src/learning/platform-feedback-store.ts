import type { IFeedbackStore, FeedbackRecord } from '@kb-labs/sdk';
import type { FeedbackEntry, FeedbackStore } from './feedback';

/**
 * Adapter bridging core-platform IFeedbackStore to Mind FeedbackStore interface.
 */
export class PlatformFeedbackStoreAdapter implements FeedbackStore {
  constructor(private readonly store: IFeedbackStore) {}

  async save(entry: FeedbackEntry): Promise<void> {
    await this.store.save({
      id: entry.feedbackId,
      queryId: entry.queryId,
      chunkId: entry.chunkId,
      scopeId: entry.scopeId,
      type: entry.type,
      score: entry.score,
      metadata: entry.metadata,
      timestamp: entry.timestamp,
    });
  }

  async getChunkFeedback(chunkId: string, scopeId: string): Promise<FeedbackEntry[]> {
    const records = await this.store.list(scopeId, 1000);
    return records
      .filter((rec: FeedbackRecord) => rec.chunkId === chunkId)
      .map((rec: FeedbackRecord) => this.toEntry(rec));
  }

  async getAverageScore(chunkId: string, scopeId: string): Promise<number> {
    const feedbacks = await this.getChunkFeedback(chunkId, scopeId);
    if (feedbacks.length === 0) {return 0.5;}
    const sum = feedbacks.reduce((acc, f) => acc + f.score, 0);
    return sum / feedbacks.length;
  }

  async getChunkUsageCount(chunkId: string, scopeId: string): Promise<number> {
    const feedbacks = await this.getChunkFeedback(chunkId, scopeId);
    return feedbacks.filter((f) => f.type === 'implicit' || f.type === 'explicit').length;
  }

  private toEntry(rec: FeedbackRecord): FeedbackEntry {
    return {
      feedbackId: rec.id,
      queryId: rec.queryId,
      chunkId: rec.chunkId,
      scopeId: rec.scopeId,
      type: rec.type,
      score: rec.score,
      timestamp: rec.timestamp,
      metadata: rec.metadata,
    };
  }
}
