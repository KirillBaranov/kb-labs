/**
 * @module @kb-labs/core-contracts
 *
 * Platform Gateway - Wire protocol for IPC/HTTP communication between workers and platform.
 */

/**
 * Vector query (duplicated from @kb-labs/core-platform to avoid dependency).
 */
export interface VectorQuery {
  vector: number[];
  topK?: number;
  filter?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Vector search result (duplicated from @kb-labs/core-platform to avoid dependency).
 */
export interface VectorSearchResult {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Vector record (duplicated from @kb-labs/core-platform to avoid dependency).
 */
export interface VectorRecord {
  id: string;
  vector: number[];
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * LLM options (duplicated from @kb-labs/core-platform to avoid dependency).
 */
export interface LLMOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  [key: string]: unknown;
}

/**
 * LLM response (duplicated from @kb-labs/core-platform to avoid dependency).
 */
export interface LLMResponse {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  [key: string]: unknown;
}

/**
 * Request context - included in every gateway call for auth/correlation.
 */
export interface RequestContext {
  /** Execution ID for correlation */
  executionId: string;

  /** Tenant ID for multi-tenancy (optional) */
  tenantId?: string;

  /** Trace ID for distributed tracing (optional) */
  traceId?: string;

  /** Auth token for security (KB_PLATFORM_SOCKET_TOKEN) */
  authToken: string;
}

/**
 * Platform Gateway - Wire protocol for IPC/HTTP communication.
 *
 * This is the low-level RPC interface that workers use to call platform services.
 * In-worker, this is wrapped by PlatformServices facade (cache.get() -> gateway.cacheGet()).
 *
 * Security: All requests must include auth token + correlation context.
 */
export interface IPlatformGateway {
  /**
   * Cache operations (flat RPC methods)
   */
  cacheGet(ctx: RequestContext, key: string): Promise<string | null>;
  cacheSet(
    ctx: RequestContext,
    key: string,
    value: string,
    ttl?: number,
  ): Promise<void>;
  cacheDelete(ctx: RequestContext, key: string): Promise<boolean>;
  cacheClear(ctx: RequestContext, pattern?: string): Promise<void>;

  /**
   * Vector operations
   */
  vectorSearch(
    ctx: RequestContext,
    query: VectorQuery,
  ): Promise<VectorSearchResult[]>;
  vectorUpsert(ctx: RequestContext, vectors: VectorRecord[]): Promise<void>;
  vectorDelete(ctx: RequestContext, ids: string[]): Promise<void>;

  /**
   * LLM operations
   */
  llmComplete(
    ctx: RequestContext,
    prompt: string,
    options?: LLMOptions,
  ): Promise<LLMResponse>;

  /**
   * Storage operations
   */
  storageRead(ctx: RequestContext, path: string): Promise<Buffer>;
  storageWrite(ctx: RequestContext, path: string, data: Buffer): Promise<void>;
  storageDelete(ctx: RequestContext, path: string): Promise<void>;
}
