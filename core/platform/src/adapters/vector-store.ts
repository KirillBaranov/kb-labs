/**
 * @module @kb-labs/core-platform/adapters/vector-store
 * Vector store abstraction for semantic search operations.
 */

/**
 * Vector record for storage.
 */
export interface VectorRecord {
  /** Unique identifier */
  id: string;
  /** Embedding vector */
  vector: number[];
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Search result from vector store.
 */
export interface VectorSearchResult {
  /** Record identifier */
  id: string;
  /** Similarity score (0-1, higher is more similar) */
  score: number;
  /** Record metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Filter for vector search.
 */
export interface VectorFilter {
  /** Field name to filter on */
  field: string;
  /** Filter operator */
  operator: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "in" | "nin";
  /** Filter value */
  value: unknown;
}

/**
 * Vector store adapter interface.
 * Implementations: @kb-labs/adapters-qdrant (production), MemoryVectorStore (noop)
 *
 * ## Namespaces
 *
 * Every method accepts an optional trailing `namespace` for isolating
 * independent corpora/tenants within one store (e.g. one namespace per index,
 * or per client). Records, searches, counts and deletes are scoped to their
 * namespace and never leak across namespaces. Omitting `namespace` targets a
 * single default namespace — so existing callers are unaffected (backward
 * compatible). Isolation is orthogonal to {@link VectorFilter}: the namespace
 * does not consume the filter slot.
 */
/**
 * Vector store contract.
 *
 * **Id round-trip is mandatory.** `search`/`get`/`query` MUST return each
 * record under the SAME `id` the caller passed to `upsert` — never a backend
 * surrogate (e.g. a UUID hash). Consumers correlate results back to their source
 * records by id (e.g. fusing vector hits with a chunk map); a store that returns
 * a different id silently drops every result at that join. If the backend can't
 * store arbitrary string ids (Qdrant requires UUID/uint), the adapter must
 * persist the original id (e.g. in payload) and restore it on read. See
 * `adapters/qdrant` for the reference implementation.
 */
export interface IVectorStore {
  /**
   * Search for similar vectors.
   * @param query - Query embedding vector
   * @param limit - Maximum number of results
   * @param filter - Optional metadata filter
   * @param namespace - Optional namespace to scope the search (default namespace if omitted)
   * @returns results whose `id` equals the id originally upserted (see contract above)
   */
  search(
    query: number[],
    limit: number,
    filter?: VectorFilter,
    namespace?: string,
  ): Promise<VectorSearchResult[]>;

  /**
   * Upsert vectors into the store.
   * @param vectors - Array of vector records to upsert
   * @param namespace - Optional namespace to upsert into (default namespace if omitted)
   */
  upsert(vectors: VectorRecord[], namespace?: string): Promise<void>;

  /**
   * Delete vectors by IDs.
   * @param ids - Array of vector IDs to delete
   * @param namespace - Optional namespace to delete from (default namespace if omitted)
   */
  delete(ids: string[], namespace?: string): Promise<void>;

  /**
   * Get total count of vectors in the store.
   * @param namespace - Optional namespace to count within (default namespace if omitted)
   */
  count(namespace?: string): Promise<number>;

  /**
   * Get vectors by IDs (optional method for bulk retrieval).
   * Allows any plugin to retrieve multiple vectors efficiently.
   * @param ids - Array of vector IDs to retrieve
   * @param namespace - Optional namespace to retrieve from (default namespace if omitted)
   * @returns Array of vector records
   */
  get?(ids: string[], namespace?: string): Promise<VectorRecord[]>;

  /**
   * Query vectors by metadata filter (optional method for advanced filtering).
   * Allows any plugin to retrieve vectors based on custom metadata criteria.
   * @param filter - Metadata filter to apply
   * @param namespace - Optional namespace to query within (default namespace if omitted)
   * @returns Array of matching vector records
   */
  query?(filter: VectorFilter, namespace?: string): Promise<VectorRecord[]>;
}
