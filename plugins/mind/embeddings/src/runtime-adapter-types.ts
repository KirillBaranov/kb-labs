/**
 * @module @kb-labs/mind-embeddings/runtime-adapter-types
 * Runtime Adapter types for embedding providers (to avoid circular dependencies)
 */

/**
 * Minimal runtime adapter interface for embedding providers
 * Full interface is in @kb-labs/mind-engine
 */
export interface EmbeddingRuntimeAdapter {
  fetch: typeof fetch;
  env: {
    get(key: string): string | undefined;
  };
  analytics?: {
    track(event: string, properties?: Record<string, unknown>): void;
    metric(name: string, value: number, tags?: Record<string, string>): void;
  };
}





