import type { FeedbackRecord, IFeedbackStore } from './feedback-store.js';

/**
 * In-memory feedback store. Simple FIFO with optional cap.
 */
export class MemoryFeedbackStore implements IFeedbackStore {
  private readonly entries: FeedbackRecord[] = [];
  private readonly maxEntries: number;

  constructor(maxEntries: number = 10_000) {
    this.maxEntries = maxEntries;
  }

  async save(record: FeedbackRecord): Promise<void> {
    this.entries.push(record);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  async list(scopeId: string, limit: number = 100): Promise<FeedbackRecord[]> {
    const scoped = this.entries.filter((entry) => entry.scopeId === scopeId);
    return scoped.slice(-limit);
  }
}

