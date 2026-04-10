/**
 * @module @kb-labs/core-platform/learning/feedback-store
 * Abstraction for storing user feedback on answers.
 */

export type FeedbackType = 'explicit' | 'implicit' | 'self';

export interface FeedbackRecord {
  id: string;
  queryId: string;
  chunkId: string;
  scopeId: string;
  type: FeedbackType;
  score: number;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

/**
 * Feedback store interface.
 * Implementations: memory, file-based (platform storage).
 */
export interface IFeedbackStore {
  save(record: FeedbackRecord): Promise<void>;
  list(scopeId: string, limit?: number): Promise<FeedbackRecord[]>;
}

