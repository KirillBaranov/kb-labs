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
import type { IDocumentDatabase, IKVStore } from './adapters/database.js';
import type { IArtifacts } from './adapters/artifacts.js';
import type { ISnapshotManager } from './snapshot/snapshot-provider.js';
import type { INotifier } from './adapters/notifier.js';
import type { IServiceTransport } from './adapters/service-transport.js';

/**
 * Plugin-visible adapter surface.
 *
 * This is the subset of platform adapters that plugin code can access.
 * Governance, execution backends, and ALS all operate on this type.
 *
 * Platform-only adapters (e.g. serviceTransport) extend IPlatformAdapters
 * but are intentionally absent here so they never reach plugin context.
 */
export interface IPluginAdapters {
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

  /** Document database (sqlite-JSONB, MongoDB, postgres-JSONB). */
  readonly documentDatabase: IDocumentDatabase;

  /** Durable key-value store (sqlite, Redis, postgres KV table). */
  readonly kvStore: IKVStore;

  /** Log reader for querying and subscribing to logs */
  readonly logs: ILogReader;

  /** Artifacts adapter (optional — not all platforms provide it) */
  readonly artifacts?: IArtifacts;

  /** Snapshot manager (optional — only available when a snapshot provider is configured) */
  readonly snapshotManager?: ISnapshotManager;

  /** Notifier adapter (optional — only when adapters.notifier is configured). */
  readonly notifier?: INotifier;
}

/**
 * Full platform adapter surface — for services and infrastructure only.
 *
 * Extends IPluginAdapters with platform-internal adapters that must never
 * be exposed to plugin code. Services (gateway, workflow, rest-api) receive
 * this type at bootstrap. Plugin governance always returns IPluginAdapters.
 */
export interface IPlatformAdapters extends IPluginAdapters {
  /**
   * Service-to-service transport (gateway → internal services).
   * Platform-only — not in ADAPTER_REGISTRY, never reaches plugin context.
   * See ADR-0022.
   */
  readonly serviceTransport?: IServiceTransport;
}
