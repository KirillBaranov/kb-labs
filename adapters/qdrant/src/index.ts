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
} from "@kb-labs/sdk/adapters";

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
 * Qdrant point IDs must be UUID/uint, so `stringToUUID` hashes the caller's id
 * one-way. To honour the round-trip contract (search returns the SAME id space
 * the caller upserted), we stash the original id in the payload under this
 * reserved key and restore it on read — otherwise consumers that correlate
 * results by id (e.g. fusing vector hits back to their source records) silently
 * drop every vector result.
 */
const ORIGINAL_ID_KEY = "__kb_id";

type QdrantPoint = { id: string | number; payload?: Record<string, unknown> | null };

/** The caller's original id (from payload), falling back to the raw point id. */
function readOriginalId(point: QdrantPoint): string {
  const orig = point.payload?.[ORIGINAL_ID_KEY];
  return typeof orig === "string" ? orig : String(point.id);
}

/** Returned metadata without the reserved id key. */
function stripReservedId(
  payload?: Record<string, unknown> | null,
): Record<string, unknown> | undefined {
  if (!payload) {
    return undefined;
  }
  const { [ORIGINAL_ID_KEY]: _omit, ...rest } = payload;
  return rest;
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
  /** Collections already ensured to exist, by resolved collection name. */
  private initializedCollections = new Set<string>();
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
   * Resolve the physical Qdrant collection for a namespace.
   *
   * Namespaces map to separate collections (physical isolation): the default
   * namespace uses the base collection, a named namespace appends `__<ns>`.
   * This keeps corpora/tenants fully isolated and droppable independently.
   */
  private collectionFor(namespace?: string): string {
    return namespace ? `${this.collectionName}__${namespace}` : this.collectionName;
  }

  /**
   * Ensure a collection exists with correct configuration.
   *
   * `getCollections` and `createCollection` are both wrapped with retry so
   * that a fresh Qdrant instance that is still starting up (ECONNREFUSED) is
   * handled gracefully. Initialization is tracked per resolved collection so
   * each namespace is created lazily on first use.
   */
  private async ensureCollection(collection: string): Promise<void> {
    if (this.initializedCollections.has(collection)) {
      return;
    }

    try {
      const collections = await withRetry(
        () => this.client.getCollections(),
        this.retryOptions,
      );

      const exists = collections.collections.some((c) => c.name === collection);

      if (!exists) {
        await withRetry(
          () =>
            this.client.createCollection(collection, {
              vectors: {
                size: this.dimension,
                distance: "Cosine",
              },
            }),
          this.retryOptions,
        );
      }

      this.initializedCollections.add(collection);
    } catch (error) {
      throw new Error(
        `Failed to initialize Qdrant collection '${collection}': ${error instanceof Error ? error.message : String(error)}`,
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
    namespace?: string,
  ): Promise<VectorSearchResult[]> {
    const collection = this.collectionFor(namespace);
    await this.ensureCollection(collection);

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
      () => this.client.search(collection, searchParams),
      this.retryOptions,
    );

    return response.map((point) => ({
      id: readOriginalId(point),
      score: point.score,
      metadata: stripReservedId(point.payload),
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
  async upsert(vectors: VectorRecord[], namespace?: string): Promise<void> {
    const collection = this.collectionFor(namespace);
    await this.ensureCollection(collection);

    if (vectors.length === 0) {
      return;
    }

    const points = vectors.map((record) => ({
      id: stringToUUID(record.id),
      vector: record.vector,
      // Preserve the caller's id so reads can round-trip it (Qdrant point ids
      // are the one-way UUID hash and can't be reversed).
      payload: { ...(record.metadata ?? {}), [ORIGINAL_ID_KEY]: record.id },
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
              this.client.upsert(collection, {
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
  async delete(ids: string[], namespace?: string): Promise<void> {
    const collection = this.collectionFor(namespace);
    await this.ensureCollection(collection);

    if (ids.length === 0) {
      return;
    }

    const uuids = ids.map(stringToUUID);

    await withRetry(
      () =>
        this.client.delete(collection, {
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
  async count(namespace?: string): Promise<number> {
    const collection = this.collectionFor(namespace);
    await this.ensureCollection(collection);

    const info = await withRetry(
      () => this.client.getCollection(collection),
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
  async get(ids: string[], namespace?: string): Promise<VectorRecord[]> {
    const collection = this.collectionFor(namespace);
    await this.ensureCollection(collection);

    if (ids.length === 0) {
      return [];
    }

    const response = await withRetry(
      () =>
        this.client.retrieve(collection, {
          ids: ids.map((id) => stringToUUID(id)),
          with_vector: true,
          with_payload: true,
        }),
      this.retryOptions,
    );

    return response.map((point) => ({
      id: readOriginalId(point),
      vector: point.vector as number[],
      metadata: stripReservedId(point.payload),
    }));
  }

  /**
   * Query vectors by metadata filter.
   *
   * The underlying `this.client.scroll()` call is wrapped with
   * {@link withRetry}.
   */
  async query(filter: VectorFilter, namespace?: string): Promise<VectorRecord[]> {
    const collection = this.collectionFor(namespace);
    await this.ensureCollection(collection);

    const response = await withRetry(
      () =>
        this.client.scroll(collection, {
          filter: this.convertFilter(filter),
          with_vector: true,
          with_payload: true,
          limit: 10000, // Max limit for bulk retrieval
        }),
      this.retryOptions,
    );

    return response.points.map((point) => ({
      id: readOriginalId(point),
      vector: point.vector as number[],
      metadata: stripReservedId(point.payload),
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
