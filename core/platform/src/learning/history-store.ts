/**
 * @module @kb-labs/core-platform/learning/history-store
 * Abstraction for storing and querying query history.
 */

export interface HistoryRecord {
  id: string;
  query: string;
  queryHash: string;
  scopeId: string;
  timestamp: number;
  topChunkIds: string[];
  resultChunkIds: string[];
  reasoningPlan?: unknown;
  queryVector?: number[];
  metadata?: Record<string, unknown>;
}

export interface HistoryFindOptions {
  scopeId: string;
  queryHash?: string;
  queryVector?: number[];
  limit?: number;
}

/**
 * History store interface.
 * Implementations: memory, file-based (platform storage), optional vector-backed.
 */
export interface IHistoryStore {
  save(record: HistoryRecord): Promise<void>;
  find(options: HistoryFindOptions): Promise<HistoryRecord[]>;
  popular(scopeId: string, limit?: number): Promise<Array<{ query: string; count: number }>>;
  saveReasoningPlan?(record: HistoryRecord): Promise<void>;
}

