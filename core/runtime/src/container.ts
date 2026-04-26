/**
 * @module @kb-labs/core-runtime/container
 * Platform DI container.
 */

import type {
  IAnalytics,
  IVectorStore,
  ILLM,
  IEmbeddings,
  ICache,
  IConfig,
  IStorage,
  ILogger,
  IEventBus,
  IInvoke,
  IWorkflowEngine,
  IJobScheduler,
  ICronManager,
  IResourceManager,
  ILogReader,
  ILogPersistence,
  ILogBuffer,
} from '@kb-labs/core-platform';
import type { IExecutionBackend } from '@kb-labs/core-contracts';
import type { ISQLDatabase, IDocumentDatabase } from '@kb-labs/core-platform/adapters';

import type { IResourceBroker } from '@kb-labs/core-resource-broker';
import type { EnvironmentManager } from './environment-manager.js';
import type { WorkspaceManager } from './workspace-manager.js';
import type { SnapshotManager } from './snapshot-manager.js';
import type { RunExecutor } from './run-executor.js';
import type { RunOrchestrator } from './run-orchestrator.js';

import {
  NoOpAnalytics,
  MemoryVectorStore,
  MockLLM,
  MockEmbeddings,
  MemoryCache,
  NoOpConfig,
  MemoryStorage,
  ConsoleLogger,
  MemoryEventBus,
  NoOpInvoke,
  NoOpSQLDatabase,
  NoOpDocumentDatabase,
  NoOpWorkflowEngine,
  NoOpJobScheduler,
  NoOpCronManager,
  NoOpResourceManager,
} from '@kb-labs/core-platform/noop';

import { HybridLogReader } from './services/hybrid-log-reader.js';

/**
 * Core adapter types (known at compile time).
 * These are the primary adapters that plugins see.
 */
export interface CoreAdapterTypes {
  analytics: IAnalytics;
  vectorStore: IVectorStore;
  llm: ILLM;
  embeddings: IEmbeddings;
  cache: ICache;
  config: IConfig;
  storage: IStorage;
  logger: ILogger;
  eventBus: IEventBus;
  invoke: IInvoke;
  sqlDatabase: ISQLDatabase;
  documentDatabase: IDocumentDatabase;
}

/**
 * Names of all core adapters.
 * Use this type instead of raw strings when referencing adapters —
 * it stays in sync with CoreAdapterTypes automatically.
 *
 * @example
 * ```typescript
 * import type { CoreAdapterName } from '@kb-labs/core-runtime';
 *
 * function requiresLLM(name: CoreAdapterName) { ... }
 * requiresLLM('llm');      // ✅
 * requiresLLM('unknown');  // ❌ compile error
 * ```
 */
export type CoreAdapterName = keyof CoreAdapterTypes;

/**
 * All adapter types (core + extensions).
 * Extensions can be any type, not known at compile time.
 */
export type AdapterTypes = CoreAdapterTypes & {
  [key: string]: unknown;
};

/**
 * Platform lifecycle phase.
 */
export type PlatformLifecyclePhase =
  | 'start'
  | 'ready'
  | 'beforeShutdown'
  | 'shutdown';

/**
 * Platform lifecycle event context.
 */
export interface PlatformLifecycleContext {
  phase: PlatformLifecyclePhase;
  cwd?: string;
  isChildProcess?: boolean;
  reason?: string;
  error?: unknown;
  metadata?: Record<string, unknown>;
}

/**
 * Platform lifecycle hooks.
 */
export interface PlatformLifecycleHooks {
  onStart?(context: PlatformLifecycleContext): void | Promise<void>;
  onReady?(context: PlatformLifecycleContext): void | Promise<void>;
  onBeforeShutdown?(context: PlatformLifecycleContext): void | Promise<void>;
  onShutdown?(context: PlatformLifecycleContext): void | Promise<void>;
  onError?(
    error: unknown,
    phase: PlatformLifecyclePhase,
    context: PlatformLifecycleContext
  ): void | Promise<void>;
}

/**
 * Platform DI container.
 * Provides access to all platform services through lazy-loaded getters.
 */
export class PlatformContainer {
  private adapters = new Map<string, unknown>();
  private lifecycleHooks = new Map<string, PlatformLifecycleHooks>();
  private initialized = false;

  // ═══════════════════════════════════════════════════════════════════════════
  // ADAPTERS (replaceable via kb.config.json)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Set an adapter instance.
   *
   * Supports both core adapters (type-safe) and extension adapters (generic).
   *
   * @example
   * ```typescript
   * // Core adapter (type-safe)
   * platform.setAdapter('logger', pinoLogger); // Type: ILogger
   *
   * // Extension adapter (requires explicit type)
   * platform.setAdapter('logRingBuffer', ringBuffer); // Type: LogRingBufferAdapter
   * ```
   *
   * @param key - Adapter key
   * @param instance - Adapter instance
   */
  setAdapter<K extends keyof CoreAdapterTypes>(key: K, instance: CoreAdapterTypes[K]): void;
  setAdapter<T = unknown>(key: string, instance: T): void;
  setAdapter(key: string, instance: unknown): void {
    this.adapters.set(key, instance);
  }

  /**
   * Get an adapter instance.
   *
   * Two overloads:
   * 1. Core adapters (logger, db, etc.) - type-safe, returns typed instance
   * 2. Extension adapters (logRingBuffer, logPersistence, etc.) - generic, requires explicit type
   *
   * @example
   * ```typescript
   * // Core adapter (type-safe)
   * const logger = platform.getAdapter('logger'); // ILogger | undefined
   *
   * // Extension adapter (requires explicit type)
   * const buffer = platform.getAdapter<ILogRingBuffer>('logRingBuffer');
   * ```
   *
   * @param key - Adapter key
   */
  getAdapter<K extends keyof CoreAdapterTypes>(key: K): CoreAdapterTypes[K] | undefined;
  getAdapter<T = unknown>(key: string): T | undefined;
  getAdapter(key: string): unknown | undefined {
    return this.adapters.get(key);
  }

  /**
   * Check if an adapter is explicitly configured (not using fallback).
   *
   * @example
   * ```typescript
   * // Core adapter
   * if (platform.hasAdapter('logger')) { ... }
   *
   * // Extension adapter
   * if (platform.hasAdapter('logRingBuffer')) { ... }
   * ```
   *
   * @param key - Adapter key
   */
  hasAdapter<K extends keyof CoreAdapterTypes>(key: K): boolean;
  hasAdapter(key: string): boolean;
  hasAdapter(key: string): boolean {
    return this.adapters.has(key);
  }

  /**
   * List all adapter names.
   * Useful for debugging and discovery.
   */
  listAdapters(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Register platform lifecycle hooks.
   * If hooks with this id already exist, they are replaced.
   */
  registerLifecycleHooks(id: string, hooks: PlatformLifecycleHooks): void {
    this.lifecycleHooks.set(id, hooks);
  }

  /**
   * Unregister platform lifecycle hooks by id.
   */
  unregisterLifecycleHooks(id: string): void {
    this.lifecycleHooks.delete(id);
  }

  /**
   * List registered lifecycle hook ids.
   */
  listLifecycleHookIds(): string[] {
    return Array.from(this.lifecycleHooks.keys());
  }

  /**
   * Emit lifecycle phase to registered hooks.
   */
  async emitLifecyclePhase(
    phase: PlatformLifecyclePhase,
    context: Omit<PlatformLifecycleContext, 'phase'> = {}
  ): Promise<void> {
    const event: PlatformLifecycleContext = { phase, ...context };
    const hookEntries = Array.from(this.lifecycleHooks.entries());

    for (const [hookId, hooks] of hookEntries) {
      let phaseHandler: ((ctx: PlatformLifecycleContext) => void | Promise<void>) | undefined;
      switch (phase) {
        case 'start':
          phaseHandler = hooks.onStart;
          break;
        case 'ready':
          phaseHandler = hooks.onReady;
          break;
        case 'beforeShutdown':
          phaseHandler = hooks.onBeforeShutdown;
          break;
        case 'shutdown':
          phaseHandler = hooks.onShutdown;
          break;
      }

      if (!phaseHandler) {
        continue;
      }

      try {
        await phaseHandler(event);
      } catch (hookError) {
        this.logger.warn('Platform lifecycle hook failed', {
          hookId,
          phase,
          error: hookError instanceof Error ? hookError.message : String(hookError),
        });

        if (hooks.onError) {
          try {
            await hooks.onError(hookError, phase, event);
          } catch (onErrorFailure) {
            this.logger.warn('Platform lifecycle onError hook failed', {
              hookId,
              phase,
              error: onErrorFailure instanceof Error ? onErrorFailure.message : String(onErrorFailure),
            });
          }
        }
      }
    }
  }

  /**
   * Emit lifecycle error to registered onError hooks.
   */
  async emitLifecycleError(
    error: unknown,
    phase: PlatformLifecyclePhase,
    context: Omit<PlatformLifecycleContext, 'phase'> = {}
  ): Promise<void> {
    const event: PlatformLifecycleContext = { phase, ...context, error };

    for (const [hookId, hooks] of this.lifecycleHooks.entries()) {
      if (!hooks.onError) {
        continue;
      }

      try {
        await hooks.onError(error, phase, event);
      } catch (onErrorFailure) {
        this.logger.warn('Platform lifecycle onError hook failed', {
          hookId,
          phase,
          error: onErrorFailure instanceof Error ? onErrorFailure.message : String(onErrorFailure),
        });
      }
    }
  }

  /**
   * Check if a service is explicitly configured (not using fallback).
   *
   * @example
   * ```typescript
   * // Core adapter — type-safe, autocomplete works
   * platform.isConfigured('llm');         // ✅
   * platform.isConfigured('vectorStore'); // ✅
   * platform.isConfigured('unknown');     // ❌ compile error
   *
   * // Extension adapter — generic string
   * platform.isConfigured('myCustomAdapter'); // ✅ string overload
   * ```
   *
   * @param service - Adapter/service name
   * @returns true if explicitly configured, false if using NoOp/fallback
   */
  isConfigured<K extends CoreAdapterName>(service: K): boolean;
  isConfigured(service: string): boolean;
  isConfigured(service: string): boolean {
    // Check if it's an adapter
    if (this.adapters.has(service)) {
      return true;
    }
    // Check core features
    if (this.initialized) {
      const coreFeatures = ['workflows', 'jobScheduler', 'cron', 'resources', 'jobs'];
      if (coreFeatures.includes(service)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get list of all configured services (adapters + core features).
   * Used for validating plugin platform requirements.
   */
  getConfiguredServices(): Set<string> {
    const services = new Set<string>();

    // Adapters
    for (const key of this.adapters.keys()) {
      services.add(key);
    }

    // Core features (always available after init)
    if (this.initialized) {
      services.add('workflows');
      services.add('jobScheduler');
      services.add('cron');
      services.add('resources');
    }

    // Resource broker (if initialized)
    if (this._resourceBroker) {
      services.add('resourceBroker');
    }

    if (this._environmentManager) {
      services.add('environmentManager');
    }
    if (this._workspaceManager) {
      services.add('workspaceManager');
    }
    if (this._snapshotManager) {
      services.add('snapshotManager');
    }
    if (this._runExecutor) {
      services.add('runExecutor');
    }
    if (this._runOrchestrator) {
      services.add('runOrchestrator');
    }

    return services;
  }

  /** Analytics adapter (fallback: NoOpAnalytics) */
  get analytics(): IAnalytics {
    return (this.adapters.get('analytics') as IAnalytics) ?? new NoOpAnalytics();
  }

  /** Vector store adapter (fallback: MemoryVectorStore) */
  get vectorStore(): IVectorStore {
    return (this.adapters.get('vectorStore') as IVectorStore) ?? new MemoryVectorStore();
  }

  /** LLM adapter (fallback: MockLLM) */
  get llm(): ILLM {
    return (this.adapters.get('llm') as ILLM) ?? new MockLLM();
  }

  /** Embeddings adapter (fallback: MockEmbeddings) */
  get embeddings(): IEmbeddings {
    return (this.adapters.get('embeddings') as IEmbeddings) ?? new MockEmbeddings();
  }

  /** Cache adapter (fallback: MemoryCache) */
  get cache(): ICache {
    return (this.adapters.get('cache') as ICache) ?? new MemoryCache();
  }

  /** Config adapter (fallback: NoOpConfig) */
  get config(): IConfig {
    return (this.adapters.get('config') as IConfig) ?? new NoOpConfig();
  }

  /** Storage adapter (fallback: MemoryStorage) */
  get storage(): IStorage {
    return (this.adapters.get('storage') as IStorage) ?? new MemoryStorage();
  }

  /** Logger adapter (fallback: ConsoleLogger) */
  get logger(): ILogger {
    return (this.adapters.get('logger') as ILogger) ?? new ConsoleLogger();
  }

  /** Event bus adapter (fallback: MemoryEventBus) */
  get eventBus(): IEventBus {
    return (this.adapters.get('eventBus') as IEventBus) ?? new MemoryEventBus();
  }

  /** Inter-plugin invocation adapter (fallback: NoOpInvoke) */
  get invoke(): IInvoke {
    return (this.adapters.get('invoke') as IInvoke) ?? new NoOpInvoke();
  }

  /** SQL database adapter (fallback: NoOpSQLDatabase — throws on use) */
  get sqlDatabase(): ISQLDatabase {
    return (this.adapters.get('sqlDatabase') as ISQLDatabase) ?? new NoOpSQLDatabase();
  }

  /** Document database adapter (fallback: NoOpDocumentDatabase — throws on use) */
  get documentDatabase(): IDocumentDatabase {
    return (this.adapters.get('documentDatabase') as IDocumentDatabase) ?? new NoOpDocumentDatabase();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SERVICES (derived from adapters, lazy-initialized)
  // ═══════════════════════════════════════════════════════════════════════════

  private _logQueryService?: ILogReader;

  /**
   * Unified log query service.
   * Automatically uses configured backends (logPersistence, logRingBuffer).
   *
   * @example
   * ```typescript
   * // Query logs
   * const result = await platform.logs.query({ level: 'error' });
   *
   * // Get log by ID
   * const log = await platform.logs.getById('log-123');
   *
   * // Full-text search
   * const results = await platform.logs.search('authentication failed');
   *
   * // Subscribe to real-time stream
   * const unsubscribe = platform.logs.subscribe((log) => console.log(log));
   * ```
   */
  get logs(): ILogReader {
    if (!this._logQueryService) {
      const persistence = this.getAdapter<ILogPersistence>('logPersistence');
      const buffer = this.logger.getLogBuffer?.() ?? this.getAdapter<ILogBuffer>('logRingBuffer');

      this._logQueryService = new HybridLogReader(persistence, buffer);
    }
    return this._logQueryService!;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CORE FEATURES (built-in, initialized during platform init)
  // ═══════════════════════════════════════════════════════════════════════════

  private _workflows?: IWorkflowEngine;
  private _jobs?: IJobScheduler;
  private _cron?: ICronManager;
  private _resources?: IResourceManager;
  private _resourceBroker?: IResourceBroker;
  private _socketServer?: { getSocketPath(): string };
  private _executionBackend?: IExecutionBackend;
  private _environmentManager?: EnvironmentManager;
  private _workspaceManager?: WorkspaceManager;
  private _snapshotManager?: SnapshotManager;
  private _runExecutor?: RunExecutor;
  private _runOrchestrator?: RunOrchestrator;

  /** Workflow engine (throws if not initialized) */
  get workflows(): IWorkflowEngine {
    if (!this._workflows) {
      // Return NoOp if not initialized for graceful degradation
      return new NoOpWorkflowEngine();
    }
    return this._workflows;
  }

  /** Job scheduler (throws if not initialized) */
  get jobs(): IJobScheduler {
    if (!this._jobs) {
      return new NoOpJobScheduler();
    }
    return this._jobs;
  }

  /** Cron manager (throws if not initialized) */
  get cron(): ICronManager {
    if (!this._cron) {
      return new NoOpCronManager();
    }
    return this._cron;
  }

  /** Resource manager (throws if not initialized) */
  get resources(): IResourceManager {
    if (!this._resources) {
      return new NoOpResourceManager();
    }
    return this._resources;
  }

  /**
   * Resource broker for rate limiting, queueing, and retry.
   * @throws Error if not initialized
   */
  get resourceBroker(): IResourceBroker {
    if (!this._resourceBroker) {
      throw new Error('ResourceBroker not initialized. Call initPlatform() first.');
    }
    return this._resourceBroker;
  }

  /**
   * Check if resource broker is initialized.
   */
  get hasResourceBroker(): boolean {
    return this._resourceBroker !== undefined;
  }

  /**
   * Initialize core features.
   * Called internally by initPlatform().
   */
  initCoreFeatures(
    workflows: IWorkflowEngine,
    jobs: IJobScheduler,
    cron: ICronManager,
    resources: IResourceManager
  ): void {
    this._workflows = workflows;
    this._jobs = jobs;
    this._cron = cron;
    this._resources = resources;
    this.initialized = true;
  }

  /**
   * Initialize resource broker.
   * Called internally by initPlatform().
   */
  initResourceBroker(broker: IResourceBroker): void {
    this._resourceBroker = broker;
  }

  /**
   * Initialize Unix socket server.
   * Called internally by initPlatform() in parent process.
   */
  initSocketServer(server: { getSocketPath(): string }): void {
    this._socketServer = server;
  }

  /**
   * Get socket path for IPC communication.
   * Returns undefined if not running in parent process.
   */
  getSocketPath(): string | undefined {
    return this._socketServer?.getSocketPath();
  }

  /**
   * Initialize execution backend.
   * Called internally by initPlatform() AFTER adapters, BEFORE core features.
   *
   * @param backend - ExecutionBackend instance (from @kb-labs/plugin-execution)
   */
  initExecutionBackend(backend: IExecutionBackend): void {
    if (this._executionBackend) {
      this.logger.warn('ExecutionBackend already initialized, replacing');
    }
    this._executionBackend = backend;
    this.logger.debug('ExecutionBackend initialized', {
      mode: backend.constructor.name,
    });
  }

  /**
   * Get execution backend.
   * Returns the initialized backend or throws if not initialized.
   *
   * @throws Error if ExecutionBackend not initialized via initPlatform()
   * @returns ExecutionBackend instance
   */
  get executionBackend(): IExecutionBackend {
    if (!this._executionBackend) {
      throw new Error(
        'ExecutionBackend not initialized. ' +
        'Call initPlatform() with execution config to initialize ExecutionBackend.'
      );
    }
    return this._executionBackend;
  }

  /**
   * Check if execution backend is initialized.
   */
  get hasExecutionBackend(): boolean {
    return !!this._executionBackend;
  }

  /**
   * Initialize orchestration services.
   * Called internally by initPlatform() after ExecutionBackend init.
   */
  initOrchestrationServices(
    environmentManager: EnvironmentManager,
    runExecutor: RunExecutor,
    runOrchestrator: RunOrchestrator
  ): void {
    this._environmentManager = environmentManager;
    this._runExecutor = runExecutor;
    this._runOrchestrator = runOrchestrator;
  }

  /**
   * Initialize infrastructure capability services.
   * Called internally by initPlatform().
   */
  initCapabilityServices(
    workspaceManager: WorkspaceManager,
    snapshotManager: SnapshotManager
  ): void {
    this._workspaceManager = workspaceManager;
    this._snapshotManager = snapshotManager;
  }

  /**
   * Environment manager service.
   * Returns undefined when not initialized (e.g., proxy/minimal platforms).
   */
  get environmentManager(): EnvironmentManager | undefined {
    return this._environmentManager;
  }

  /**
   * Workspace manager service.
   * Returns undefined when not initialized (e.g., proxy/minimal platforms).
   */
  get workspaceManager(): WorkspaceManager | undefined {
    return this._workspaceManager;
  }

  /**
   * Snapshot manager service.
   * Returns undefined when not initialized (e.g., proxy/minimal platforms).
   */
  get snapshotManager(): SnapshotManager | undefined {
    return this._snapshotManager;
  }

  /**
   * Run executor service.
   */
  get runExecutor(): RunExecutor {
    if (!this._runExecutor) {
      throw new Error('RunExecutor not initialized. Call initPlatform() first.');
    }
    return this._runExecutor;
  }

  /**
   * Run orchestrator service.
   */
  get runOrchestrator(): RunOrchestrator {
    if (!this._runOrchestrator) {
      throw new Error(
        'RunOrchestrator not initialized. Call initPlatform() first.'
      );
    }
    return this._runOrchestrator;
  }

  /**
   * Check if platform is initialized.
   */
  get isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Reset platform to initial state.
   * Clears all adapters and core features.
   * Used primarily for testing.
   */
  reset(): void {
    this.adapters.clear();
    this.lifecycleHooks.clear();
    this._workflows = undefined;
    this._jobs = undefined;
    this._cron = undefined;
    this._resources = undefined;
    this._resourceBroker = undefined;
    this._socketServer = undefined;
    this._executionBackend = undefined;
    this._environmentManager = undefined;
    this._workspaceManager = undefined;
    this._snapshotManager = undefined;
    this._runExecutor = undefined;
    this._runOrchestrator = undefined;
    this.initialized = false;
  }

  /**
   * Shutdown platform gracefully.
   * Closes all resources, stops workers, cleanup.
   */
  async shutdown(): Promise<void> {
    await this.emitLifecyclePhase('beforeShutdown', {
      reason: 'platform.shutdown',
      metadata: {
        adapterCount: this.adapters.size,
        hasExecutionBackend: !!this._executionBackend,
      },
    });

    // Shutdown execution backend (closes worker pool)
    if (this._executionBackend) {
      try {
        await this._executionBackend.shutdown();
      } catch (error) {
        this.logger.warn('ExecutionBackend shutdown failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (this._environmentManager) {
      try {
        await this._environmentManager.shutdown();
      } catch (error) {
        this.logger.warn('EnvironmentManager shutdown failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (this._workspaceManager) {
      try {
        await this._workspaceManager.shutdown();
      } catch (error) {
        this.logger.warn('WorkspaceManager shutdown failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (this._snapshotManager) {
      try {
        await this._snapshotManager.shutdown();
      } catch (error) {
        this.logger.warn('SnapshotManager shutdown failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Gracefully close adapters in reverse load order so dependents are closed before dependencies.
    const adaptersInReverseLoadOrder = Array.from(this.adapters.entries()).reverse();
    for (const [adapterId, adapter] of adaptersInReverseLoadOrder) {
      if (!adapter || adapter === this._executionBackend) {
        continue;
      }

      const candidate = adapter as {
        close?: () => Promise<void> | void;
        dispose?: () => Promise<void> | void;
        shutdown?: () => Promise<void> | void;
      };

      try {
        if (typeof candidate.close === 'function') {
          await candidate.close.call(adapter);
        } else if (typeof candidate.dispose === 'function') {
          await candidate.dispose.call(adapter);
        } else if (typeof candidate.shutdown === 'function') {
          await candidate.shutdown.call(adapter);
        }
      } catch (error) {
        this.logger.warn('Adapter shutdown failed', {
          adapterId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // TODO: Shutdown other resources (workflows, jobs, cron, etc.)
    await this.emitLifecyclePhase('shutdown', {
      reason: 'platform.shutdown',
      metadata: {
        adapterCount: this.adapters.size,
      },
    });
  }
}

/**
 * Cross-realm Symbol for platform singleton.
 *
 * Uses Symbol.for() which creates a GLOBAL symbol that works across:
 * - CJS (require('@kb-labs/core-runtime'))
 * - ESM (import '@kb-labs/core-runtime')
 * - Worker Threads (sandbox workers)
 *
 * Symbol.for() is the standard way to create cross-realm symbols:
 * - React uses Symbol.for('react.element')
 * - Redux uses Symbol.for('redux.observable')
 * - This is NOT a hack - it's official JavaScript API
 *
 * Storage: We use `process` instead of `globalThis` because:
 * - `globalThis` is DIFFERENT between CJS and ESM module realms
 * - `process` is the ONLY object shared across all module types in Node.js
 * - This ensures true singleton behavior across the entire Node.js process
 */
const PLATFORM_SINGLETON_KEY = Symbol.for('kb.platform');

/**
 * Type augmentation for process to track platform singleton.
 * This makes TypeScript aware of our platform storage.
 */
declare global {
  var __KB_PLATFORM_SINGLETON__: PlatformContainer | undefined;
}

// Helper to access the singleton via Symbol.for()
function getPlatformFromProcess(): PlatformContainer | undefined {
  return (process as NodeJS.Process & Record<symbol, unknown>)[PLATFORM_SINGLETON_KEY] as PlatformContainer | undefined;
}

function setPlatformInProcess(platform: PlatformContainer): void {
  (process as NodeJS.Process & Record<symbol, unknown>)[PLATFORM_SINGLETON_KEY] = platform;
}

/**
 * Global platform container singleton.
 *
 * Uses Symbol.for() + process for TRUE cross-realm singleton:
 * - Works across CJS (CLI bin.cjs) and ESM (sandbox workers)
 * - All worker threads share the same process object
 * - Each Docker container gets its own process (correct isolation!)
 *
 * This ensures:
 * ✅ One QdrantVectorStore instance per Node.js process
 * ✅ One Logger instance per Node.js process
 * ✅ One Analytics adapter per Node.js process
 * ✅ All sandbox workers share adapters (resource efficiency)
 * ✅ Docker containers are isolated (security for paranoid mode)
 */
export const platform: PlatformContainer = (() => {
  // Check if singleton already exists
  const existing = getPlatformFromProcess();

  if (existing && typeof existing.setAdapter === 'function' && typeof existing.getAdapter === 'function') {
    return existing;
  }

  // Create new singleton and store in process
  const newPlatform = new PlatformContainer();
  setPlatformInProcess(newPlatform);
  return newPlatform;
})();
