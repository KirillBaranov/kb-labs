/**
 * @module @kb-labs/core-platform/platform-adapters
 * Unified interface for all platform adapters.
 * Used by IPC servers to access adapters for proxying.
 */

import type { IAnalytics } from './adapters/analytics.js';
import type { IVectorStore } from './adapters/vector-store.js';
import type { ILLM } from './adapters/llm.js';
import type { IEmbeddings } from './adapters/embeddings.js';
import type { ICache } from './adapters/cache.js';
import type { IConfig } from './adapters/config.js';
import type { IStorage } from './adapters/storage.js';
import type { ILogger } from './adapters/logger.js';
import type { IEventBus } from './adapters/event-bus.js';
import type { IInvoke } from './adapters/invoke.js';
import type { ILogReader } from './adapters/log-reader.js';
import type { ISQLDatabase, IDocumentDatabase } from './adapters/database.js';
import type { IArtifacts } from './adapters/artifacts.js';

/**
 * Platform adapters container interface.
 * Provides access to all platform adapters for IPC proxying.
 *
 * This interface is implemented by PlatformContainer in core-runtime.
 * IPC servers in core-ipc use this interface to access adapters.
 */
export interface IPlatformAdapters {
  /** Logger adapter */
  readonly logger: ILogger;

  /** Analytics adapter (telemetry, events) */
  readonly analytics: IAnalytics;

  /** Vector store adapter (Qdrant, Pinecone, etc.) */
  readonly vectorStore: IVectorStore;

  /** LLM adapter (OpenAI, Anthropic, etc.) */
  readonly llm: ILLM;

  /** Embeddings adapter (OpenAI, Cohere, etc.) */
  readonly embeddings: IEmbeddings;

  /** Cache adapter (Redis, in-memory, etc.) */
  readonly cache: ICache;

  /** Config adapter (file, env, remote, etc.) */
  readonly config: IConfig;

  /** Storage adapter (S3, filesystem, etc.) */
  readonly storage: IStorage;

  /** Event bus adapter (in-memory, Redis, etc.) */
  readonly eventBus: IEventBus;

  /** Invoke adapter (cross-plugin invocation) */
  readonly invoke: IInvoke;

  /** SQL database adapter (SQLite, PostgreSQL, etc.) */
  readonly sqlDatabase: ISQLDatabase;

  /** Document database adapter (MongoDB, etc.) */
  readonly documentDatabase: IDocumentDatabase;

  /** Log reader for querying and subscribing to logs */
  readonly logs: ILogReader;

  /** Artifacts adapter (optional — not all platforms provide it) */
  readonly artifacts?: IArtifacts;
}
