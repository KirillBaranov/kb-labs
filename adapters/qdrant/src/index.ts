/**
 * @module @kb-labs/adapters-qdrant
 * Qdrant adapter implementing IVectorStore interface.
 *
 * All Qdrant client calls that touch the network are wrapped with
 * exponential-backoff retry logic ({@link withRetry}) so that transient
 * failures (ECONNREFUSED, ETIMEDOUT, HTTP 503, etc.) are handled
 * automatically without propagating to callers.
 *
 * @example
 * ```typescript
 * import { createAdapter } from '@kb-labs/adapters-qdrant';
 *
 * const vectorStore = createAdapter({
 *   url: 'http://localhost:6333',
 *   apiKey: process.env.QDRANT_API_KEY,
 *   collectionName: 'my-collection',
 *   dimension: 1536,
 * });
 *
 * await vectorStore.upsert([
 *   { id: '1', vector: [...], metadata: { text: 'hello' } },
 * ]);
 *
 * const results = await vectorStore.search([...], 10);
 * ```
 */

import { QdrantClient } from "@qdrant/js-client-rest";
import type {
  IVectorStore,
  VectorRecord,
  VectorSearchResult,
  VectorFilter,
} from "@kb-labs/core-platform";

// Re-export manifest
export { manifest } from "./manifest.js";
// Re-export retry utilities so callers can customise if needed
export { withRetry, isTransientError } from "./retry.js";
export type { RetryOptions } from "./retry.js";

import { createHash } from "node:crypto";
import { withRetry, type RetryOptions } from "./retry.js";

/**
 * Configuration for Qdrant vector store adapter.
 */
export interface QdrantVectorStoreConfig {
  /** Qdrant server URL (e.g., 'http://localhost:6333') */
  url: string;
  /** API key for authentication (optional) */
  apiKey?: string;
  /** Collection name (default: 'kb-vectors') */
  collectionName?: string;
  /** Vector dimension (default: 1536, for OpenAI text-embedding-3-small) */
  dimension?: number;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /**
   * Retry configuration applied to every Qdrant client call.
   * Transient errors (ECONNREFUSED, ETIMEDOUT, HTTP 503 / 429 / 502 / 504)
   * are retried automatically with full-jitter exponential back-off.
   *
   * Set `maxAttempts: 1` to disable retries entirely.
   */
  retry?: RetryOptions;
}

/**
 * Convert a string to a deterministic UUID v4-like format.
 * Qdrant requires point IDs to be either unsigned integers or UUIDs.
 */
function stringToUUID(str: string): string {
  const hash = createHash("sha256").update(str).digest();
  // Format as UUID v4 (8-4-4-4-12 hex digits)
  return [
    hash.slice(0, 4).toString("hex"),
    hash.slice(4, 6).toString("hex"),
    hash.slice(6, 8).toString("hex"),
    hash.slice(8, 10).toString("hex"),
    hash.slice(10, 16).toString("hex"),
  ].join("-");
}

/**
 * Default retry options used for all Qdrant client calls.
 *
 * Strategy: up to 4 attempts, full-jitter exponential back-off starting at
 * 200 ms, capped at 10 s.  That gives worst-case wait of ~10 s before the
 * final attempt, which comfortably covers a Qdrant cold-start or a brief
 * 503 during a rolling restart.
 */
const DEFAULT_RETRY_OPTIONS: Required<
  Pick<RetryOptions, "maxAttempts" | "baseDelayMs" | "maxDelayMs">
> = {
  maxAttempts: 4,
  baseDelayMs: 200,
  maxDelayMs: 10_000,
};

/**
 * Qdrant implementation of IVectorStore interface.
 *
 * All network-facing operations (`search`, `upsert`, `delete`, `scroll`,
 * `retrieve`, `getCollections`, `createCollection`, `getCollection`) are
 * wrapped with {@link withRetry} to transparently handle transient errors.
 */
export class QdrantVectorStore implements IVectorStore {
  private client: QdrantClient;
  private collectionName: string;
  private dimension: number;
  private initialized = false;
  private url: string;
  private retryOptions: RetryOptions;

  // Adaptive concurrency state
  private concurrency = 3; // Start with 3 parallel batches
  private consecutiveErrors = 0;
  private consecutiveSuccesses = 0;

  constructor(config: QdrantVectorStoreConfig) {
    this.url = config.url;
    this.client = new QdrantClient({
      url: config.url,
      apiKey: config.apiKey,
      timeout: config.timeout ?? 30000,
      checkCompatibility: false,
    });
    this.collectionName = config.collectionName ?? "kb-vectors";
    this.dimension = config.dimension ?? 1536;
    // Merge caller-supplied retry options over the defaults
    this.retryOptions = { ...DEFAULT_RETRY_OPTIONS, ...config.retry };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Ensure collection exists with correct configuration.
   *
   * `getCollections` and `createCollection` are both wrapped with retry so
   * that a fresh Qdrant instance that is still starting up (ECONNREFUSED) is
   * handled gracefully.
   */
  private async ensureCollection(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      const collections = await withRetry(
        () => this.client.getCollections(),
        this.retryOptions,
      );

      const exists = collections.collections.some(
        (c) => c.name === this.collectionName,
      );

      if (!exists) {
        await withRetry(
          () =>
            this.client.createCollection(this.collectionName, {
              vectors: {
                size: this.dimension,
                distance: "Cosine",
              },
            }),
          this.retryOptions,
        );
      }

      this.initialized = true;
    } catch (error) {
      throw new Error(
        `Failed to initialize Qdrant collection: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // IVectorStore — required methods
  // ---------------------------------------------------------------------------

  /**
   * Search for the nearest vectors.
   *
   * The underlying `this.client.search()` call is wrapped with
   * {@link withRetry} to handle ECONNREFUSED, ETIMEDOUT, and HTTP 503
   * transparently.
   */
  async search(
    query: number[],
    limit: number,
    filter?: VectorFilter,
  ): Promise<VectorSearchResult[]> {
    await this.ensureCollection();

    // Build Qdrant filter if provided
    const qdrantFilter = filter
      ? {
          must: [
            {
              key: filter.field,
              match:
                filter.operator === "eq" ? { value: filter.value } : undefined,
              range:
                filter.operator === "gt" || filter.operator === "gte"
                  ? { gt: filter.value }
                  : filter.operator === "lt" || filter.operator === "lte"
                    ? { lt: filter.value }
                    : undefined,
            },
          ],
        }
      : undefined;

    const searchParams = {
      vector: query,
      limit,
      filter: qdrantFilter,
      with_payload: true,
    } as const;

    const response = await withRetry(
      () => this.client.search(this.collectionName, searchParams),
      this.retryOptions,
    );

    return response.map((point) => ({
      id: String(point.id),
      score: point.score,
      metadata: point.payload as Record<string, unknown> | undefined,
    }));
  }

  /**
   * Upsert vectors in batches with adaptive parallel processing.
   *
   * Each individual `this.client.upsert()` call is wrapped with
   * {@link withRetry}.  The adaptive-concurrency logic is preserved:
   * on sustained success the concurrency goes up; on sustained failure
   * it is halved (the retry wrapper already handles brief transient
   * errors before they reach the concurrency bookkeeping).
   */
  async upsert(vectors: VectorRecord[]): Promise<void> {
    await this.ensureCollection();

    if (vectors.length === 0) {
      return;
    }

    const points = vectors.map((record) => ({
      id: stringToUUID(record.id),
      vector: record.vector,
      payload: record.metadata ?? {},
    }));

    // Batch upsert with adaptive parallel processing (Qdrant supports up to 100 points per request)
    const batchSize = 100;
    const _totalBatches = Math.ceil(points.length / batchSize);

    // Create all batches
    type QdrantPoint = {
      id: string;
      vector: number[];
      payload: Record<string, unknown>;
    };
    const batches: QdrantPoint[][] = [];
    for (let i = 0; i < points.length; i += batchSize) {
      batches.push(points.slice(i, i + batchSize) as QdrantPoint[]);
    }

    // Process batches with adaptive concurrency
    let batchIndex = 0;
    while (batchIndex < batches.length) {
      const currentConcurrency = Math.min(
        this.concurrency,
        batches.length - batchIndex,
      );
      const batchGroup = batches.slice(
        batchIndex,
        batchIndex + currentConcurrency,
      );

      const batchPromises = batchGroup.map(async (batch) => {
        try {
          // ⚡ Don't wait for indexing — let Qdrant index asynchronously.
          // Transient failures are transparently retried before bubbling up.
          await withRetry(
            () =>
              this.client.upsert(this.collectionName, {
                wait: false,
                points: batch,
              }),
            this.retryOptions,
          );

          // Success: increase concurrency gradually
          this.consecutiveErrors = 0;
          this.consecutiveSuccesses++;
          if (this.consecutiveSuccesses >= 5 && this.concurrency < 10) {
            this.concurrency++;
            this.consecutiveSuccesses = 0;
          }
        } catch (error) {
          // Persistent (non-transient) error after all retries — adjust concurrency
          this.consecutiveSuccesses = 0;
          this.consecutiveErrors++;
          if (this.consecutiveErrors >= 2 && this.concurrency > 1) {
            this.concurrency = Math.max(1, Math.floor(this.concurrency / 2));
            this.consecutiveErrors = 0;
          }

          throw error;
        }
      });

      // Wait for this group of concurrent batches to complete
      try {
        await Promise.all(batchPromises);
        batchIndex += batchGroup.length;
      } catch (_error) {
        // If group fails, retry with reduced concurrency (already adjusted above)
        // Don't increment batchIndex — retry same batches
      }
    }
  }

  /**
   * Delete vectors by ID.
   *
   * The underlying `this.client.delete()` call is wrapped with
   * {@link withRetry}.
   */
  async delete(ids: string[]): Promise<void> {
    await this.ensureCollection();

    if (ids.length === 0) {
      return;
    }

    const uuids = ids.map(stringToUUID);

    await withRetry(
      () =>
        this.client.delete(this.collectionName, {
          wait: false, // ⚡ Don't wait for indexing - let Qdrant process asynchronously
          points: uuids,
        }),
      this.retryOptions,
    );
  }

  /**
   * Return the total number of vectors in the collection.
   *
   * The underlying `this.client.getCollection()` call is wrapped with
   * {@link withRetry}.
   */
  async count(): Promise<number> {
    await this.ensureCollection();

    const info = await withRetry(
      () => this.client.getCollection(this.collectionName),
      this.retryOptions,
    );
    return info.points_count ?? 0;
  }

  // ---------------------------------------------------------------------------
  // IVectorStore — optional methods
  // ---------------------------------------------------------------------------

  /**
   * Get vectors by IDs.
   *
   * The underlying `this.client.retrieve()` call is wrapped with
   * {@link withRetry}.
   */
  async get(ids: string[]): Promise<VectorRecord[]> {
    await this.ensureCollection();

    if (ids.length === 0) {
      return [];
    }

    const response = await withRetry(
      () =>
        this.client.retrieve(this.collectionName, {
          ids: ids.map((id) => stringToUUID(id)),
          with_vector: true,
          with_payload: true,
        }),
      this.retryOptions,
    );

    return response.map((point) => ({
      id: String(point.id),
      vector: point.vector as number[],
      metadata: point.payload as Record<string, unknown> | undefined,
    }));
  }

  /**
   * Query vectors by metadata filter.
   *
   * The underlying `this.client.scroll()` call is wrapped with
   * {@link withRetry}.
   */
  async query(filter: VectorFilter): Promise<VectorRecord[]> {
    await this.ensureCollection();

    const response = await withRetry(
      () =>
        this.client.scroll(this.collectionName, {
          filter: this.convertFilter(filter),
          with_vector: true,
          with_payload: true,
          limit: 10000, // Max limit for bulk retrieval
        }),
      this.retryOptions,
    );

    return response.points.map((point) => ({
      id: String(point.id),
      vector: point.vector as number[],
      metadata: point.payload as Record<string, unknown> | undefined,
    }));
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Convert platform VectorFilter to Qdrant filter format.
   */
  private convertFilter(filter: VectorFilter): Record<string, unknown> {
    const fieldParts = filter.field.split(".");
    const fieldName = fieldParts[fieldParts.length - 1]; // Get last part after dots

    switch (filter.operator) {
      case "eq":
        return { must: [{ key: fieldName, match: { value: filter.value } }] };
      case "ne":
        return {
          must_not: [{ key: fieldName, match: { value: filter.value } }],
        };
      case "in":
        return {
          must: [{ key: fieldName, match: { any: filter.value as unknown[] } }],
        };
      case "nin":
        return {
          must_not: [{ key: fieldName, match: { any: filter.value as unknown[] } }],
        };
      default:
        // For gt/gte/lt/lte - use range filter
        return {
          must: [
            { key: fieldName, range: { [filter.operator]: filter.value } },
          ],
        };
    }
  }
}

/**
 * Create Qdrant vector store adapter.
 * This is the factory function called by initPlatform() when loading adapters.
 */
export function createAdapter(
  config?: QdrantVectorStoreConfig,
): QdrantVectorStore {
  const fallbackUrl = process.env.QDRANT_URL ?? "http://localhost:6333";
  const finalConfig: QdrantVectorStoreConfig = {
    url: config?.url ?? fallbackUrl,
    apiKey: config?.apiKey ?? process.env.QDRANT_API_KEY,
    collectionName: config?.collectionName,
    dimension: config?.dimension,
    timeout: config?.timeout,
    retry: config?.retry,
  };
  return new QdrantVectorStore(finalConfig);
}

// Default export for direct import
export default createAdapter;
