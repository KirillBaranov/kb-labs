/**
 * @module @kb-labs/core-platform/wrappers/analytics-vector-store
 * Analytics wrapper for IVectorStore that tracks usage
 */

import type { IVectorStore, VectorRecord, VectorSearchResult, VectorFilter } from '../adapters/vector-store.js';
import type { IAnalytics } from '../adapters/analytics.js';

/**
 * Generate unique request ID for tracking
 */
function generateRequestId(): string {
  return `vec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Analytics wrapper for vector store adapter.
 * Tracks all vector operations to analytics.
 */
export class AnalyticsVectorStore implements IVectorStore {
  constructor(
    private realVectorStore: IVectorStore,
    private analytics: IAnalytics
  ) {}

  async search(query: number[], limit: number, filter?: VectorFilter): Promise<VectorSearchResult[]> {
    const startTime = Date.now();
    const requestId = generateRequestId();

    // Track start
    await this.analytics.track('vectorstore.search.started', {
      requestId,
      dimensions: query.length,
      limit,
      hasFilter: !!filter,
    });

    try {
      const results = await this.realVectorStore.search(query, limit, filter);
      const durationMs = Date.now() - startTime;

      // Calculate average score
      const avgScore = results.length > 0
        ? results.reduce((sum, r) => sum + r.score, 0) / results.length
        : 0;

      // Track completion
      await this.analytics.track('vectorstore.search.completed', {
        requestId,
        dimensions: query.length,
        limit,
        resultsCount: results.length,
        avgScore,
        durationMs,
        hasFilter: !!filter,
      });

      return results;
    } catch (error) {
      await this.analytics.track('vectorstore.search.error', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });
      throw error;
    }
  }

  async upsert(vectors: VectorRecord[]): Promise<void> {
    const startTime = Date.now();
    const requestId = generateRequestId();

    // Track start
    await this.analytics.track('vectorstore.upsert.started', {
      requestId,
      vectorCount: vectors.length,
    });

    try {
      await this.realVectorStore.upsert(vectors);
      const durationMs = Date.now() - startTime;

      // Track completion
      await this.analytics.track('vectorstore.upsert.completed', {
        requestId,
        vectorCount: vectors.length,
        durationMs,
      });
    } catch (error) {
      await this.analytics.track('vectorstore.upsert.error', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
        vectorCount: vectors.length,
      });
      throw error;
    }
  }

  async delete(ids: string[]): Promise<void> {
    const startTime = Date.now();
    const requestId = generateRequestId();

    // Track start
    await this.analytics.track('vectorstore.delete.started', {
      requestId,
      idsCount: ids.length,
    });

    try {
      await this.realVectorStore.delete(ids);
      const durationMs = Date.now() - startTime;

      // Track completion
      await this.analytics.track('vectorstore.delete.completed', {
        requestId,
        idsCount: ids.length,
        durationMs,
      });
    } catch (error) {
      await this.analytics.track('vectorstore.delete.error', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });
      throw error;
    }
  }

  async count(): Promise<number> {
    const startTime = Date.now();
    const requestId = generateRequestId();

    try {
      const count = await this.realVectorStore.count();
      const durationMs = Date.now() - startTime;

      // Track count operation
      await this.analytics.track('vectorstore.count.completed', {
        requestId,
        count,
        durationMs,
      });

      return count;
    } catch (error) {
      await this.analytics.track('vectorstore.count.error', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });
      throw error;
    }
  }

  async get(ids: string[]): Promise<VectorRecord[]> {
    if (!this.realVectorStore.get) {
      throw new Error('get() not implemented by underlying vector store');
    }

    const startTime = Date.now();
    const requestId = generateRequestId();

    try {
      const results = await this.realVectorStore.get(ids);
      const durationMs = Date.now() - startTime;

      await this.analytics.track('vectorstore.get.completed', {
        requestId,
        idsCount: ids.length,
        resultsCount: results.length,
        durationMs,
      });

      return results;
    } catch (error) {
      await this.analytics.track('vectorstore.get.error', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });
      throw error;
    }
  }

  async query(filter: VectorFilter): Promise<VectorRecord[]> {
    if (!this.realVectorStore.query) {
      throw new Error('query() not implemented by underlying vector store');
    }

    const startTime = Date.now();
    const requestId = generateRequestId();

    try {
      const results = await this.realVectorStore.query(filter);
      const durationMs = Date.now() - startTime;

      await this.analytics.track('vectorstore.query.completed', {
        requestId,
        resultsCount: results.length,
        durationMs,
      });

      return results;
    } catch (error) {
      await this.analytics.track('vectorstore.query.error', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });
      throw error;
    }
  }
}
