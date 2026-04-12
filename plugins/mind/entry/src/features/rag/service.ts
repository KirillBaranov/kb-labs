import {
  usePlatform,
  useLLM,
  type PlatformServices,
} from '@kb-labs/sdk';
import type {
  MindIntent,
  MindQueryResult,
  MindIndexStats,
} from '@kb-labs/mind-types';
import { createHash } from 'node:crypto';
import * as path from 'node:path';
import {
  MIND_PRODUCT_ID,
  createMindRuntime,
} from '../../runtime/mind-runtime';
import { loadManifest } from '@kb-labs/mind-engine';
import type {
  AgentQueryOrchestrator} from '@kb-labs/mind-orchestrator';
import {
  createAgentQueryOrchestrator
} from '@kb-labs/mind-orchestrator';

type AgentQueryMode = 'instant' | 'auto' | 'thinking';
type AgentResponse = Record<string, unknown>;
type AgentErrorResponse = {
  error: { code: string; message: string; recoverable: boolean };
  meta: Record<string, unknown>;
};

/**
 * Global orchestrator instance for cache persistence across queries
 */
let globalOrchestrator: InstanceType<typeof AgentQueryOrchestrator> | null = null;

export interface RagIndexOptions {
  cwd: string;
  scopeId?: string;
  include?: string;
  exclude?: string;
  skipDeduplication?: boolean;
  platform?: PlatformServices;
  /**
   * Mind configuration (from ctx.config)
   * If provided, will be used instead of reading from file
   */
  config?: any;
}

/**
 * Information about which adapters were used during indexing
 */
export interface AdapterInfo {
  vectorStore: string;
  embeddings: string;
  storage: string;
  llm: string;
  cache: string;
}

export interface RagIndexStats extends MindIndexStats {
  deletedFiles?: number;
  deletedChunks?: number;
  invalidChunks?: number;
}

export interface RagIndexResult {
  scopeIds: string[];
  adapters: AdapterInfo;
  stats: RagIndexStats;
}

export interface RagIndexOptionsWithRuntime extends RagIndexOptions {
  runtime?: Parameters<typeof createMindRuntime>[0]['runtime'];
}

/**
 * Get adapter name from platform service or fallback
 */
function getAdapterName(service: any, fallback: string): string {
  if (!service) {return fallback;}
  // Try to get constructor name or class name
  const name = service.constructor?.name || service.name || service.id;
  if (name && name !== 'Object' && name !== 'Function') {
    return name;
  }
  return fallback;
}

export async function runRagIndex(
  options: RagIndexOptions | RagIndexOptionsWithRuntime,
): Promise<RagIndexResult> {
  // Use SDK's usePlatform() to get global platform singleton
  const platform = options.platform ?? usePlatform();

  // Collect adapter info - shows actual adapters being used
  const adapters: AdapterInfo = {
    vectorStore: getAdapterName(platform?.vectorStore, 'LocalVectorStore (fallback)'),
    embeddings: getAdapterName(platform?.embeddings, 'DeterministicEmbeddings (fallback)'),
    storage: getAdapterName(platform?.storage, 'MemoryStorage (fallback)'),
    llm: getAdapterName(platform?.llm, 'LocalStubLLM (fallback)'),
    cache: getAdapterName(platform?.cache, 'MemoryCache (fallback)'),
  };

  // If include/exclude provided, override paths in all sources (ESLint-style)
  let effectiveConfig = options.config;
  if (options.include || options.exclude) {
    // If config already provided (from useConfig), clone and modify it
    // If not provided, will be loaded by createMindRuntime
    let mindConfig = effectiveConfig;

    // Override paths/exclude in ALL sources (ESLint-style override)
    if (mindConfig?.sources && Array.isArray(mindConfig.sources)) {
      mindConfig = { ...mindConfig };
      mindConfig.sources = mindConfig.sources.map((source: any) => {
        const overriddenSource = { ...source };

        // --include overrides paths
        if (options.include) {
          overriddenSource.paths = [options.include];
        }

        // --exclude overrides exclude
        if (options.exclude) {
          overriddenSource.exclude = options.exclude.split(',').map(s => s.trim());
        }

        return overriddenSource;
      });
      effectiveConfig = mindConfig;
    }
  }

  const runtime = await createMindRuntime({
    cwd: options.cwd,
    config: effectiveConfig,
    runtime: 'runtime' in options ? options.runtime : undefined,
    platform: options.platform,
  });
  const allScopeIds = runtime.config.scopes?.map((scope: any) => scope.id) ?? [];
  if (!allScopeIds.length) {
    throw new Error('No mind scopes found. Update kb.config.json first.');
  }

  const scopeIds = options.scopeId
    ? allScopeIds.filter((scopeId: string) => scopeId === options.scopeId)
    : allScopeIds;

  if (!scopeIds.length) {
    throw new Error(
      `Scope "${options.scopeId}" is not defined in mind.scopes.`,
    );
  }

  // Set skip deduplication env var if requested
  const originalSkipDedup = process.env.KB_SKIP_DEDUPLICATION;
  if (options.skipDeduplication) {
    process.env.KB_SKIP_DEDUPLICATION = 'true';
  }

  // Aggregate stats across all scopes
  const aggregatedStats = {
    filesDiscovered: 0,
    filesProcessed: 0,
    filesSkipped: 0,
    chunksStored: 0,
    chunksUpdated: 0,
    chunksSkipped: 0,
    errorCount: 0,
    durationMs: 0,
    deletedFiles: 0,
    deletedChunks: 0,
    invalidChunks: 0,
  } satisfies RagIndexStats;

  try {
    for (const scopeId of scopeIds) {
      const scopeStats = await runtime.service.index(scopeId) as RagIndexStats;
      if (scopeStats) {
        aggregatedStats.filesDiscovered += scopeStats.filesDiscovered;
        aggregatedStats.filesProcessed += scopeStats.filesProcessed;
        aggregatedStats.filesSkipped += scopeStats.filesSkipped;
        aggregatedStats.chunksStored += scopeStats.chunksStored;
        aggregatedStats.chunksUpdated += scopeStats.chunksUpdated;
        aggregatedStats.chunksSkipped += scopeStats.chunksSkipped;
        aggregatedStats.errorCount += scopeStats.errorCount;
        aggregatedStats.durationMs += scopeStats.durationMs;
        aggregatedStats.deletedFiles = (aggregatedStats.deletedFiles ?? 0) + (scopeStats.deletedFiles ?? 0);
        aggregatedStats.deletedChunks = (aggregatedStats.deletedChunks ?? 0) + (scopeStats.deletedChunks ?? 0);
        aggregatedStats.invalidChunks = (aggregatedStats.invalidChunks ?? 0) + (scopeStats.invalidChunks ?? 0);
      }
    }
  } finally {
    // Restore original env var value
    if (originalSkipDedup === undefined) {
      delete process.env.KB_SKIP_DEDUPLICATION;
    } else {
      process.env.KB_SKIP_DEDUPLICATION = originalSkipDedup;
    }
  }

  // Invalidate query cache after re-indexing
  // This ensures fresh results after index update
  if (globalOrchestrator) {
    await globalOrchestrator.invalidateCache(scopeIds);
  }

  return { scopeIds, adapters, stats: aggregatedStats };
}

export interface RagQueryOptions {
  cwd: string;
  scopeId?: string;
  text: string;
  intent?: MindIntent;
  limit?: number;
  profileId?: string;
  runtime?: Parameters<typeof createMindRuntime>[0]['runtime'];
  onProgress?: (stage: string, details?: string) => void;
  platform?: PlatformServices;
  /**
   * Mind configuration (from ctx.config)
   * If provided, will be used instead of reading from file
   */
  config?: any;
}

export interface RagQueryResult {
  scopeId: string;
  result: MindQueryResult;
}

export async function runRagQuery(
  options: RagQueryOptions,
): Promise<RagQueryResult> {
  // Convert onProgress from (stage, details) to ProgressEvent format
  const onProgressEvent = options.onProgress
    ? (event: { stage: string; details?: string; metadata?: Record<string, unknown>; timestamp: number }) => {
        try {
          // Map engine stage names to human-readable messages
          const stageMap: Record<string, string> = {
            'using_reasoning_engine': 'Using reasoning engine',
            'reasoning_completed': 'Reasoning completed',
            'analyzing_query_complexity': 'Analyzing query complexity',
            'query_is_simple': 'Query is simple',
            'planning_query': 'Planning query',
            'query_plan_generated': 'Query plan generated',
            'executing_subqueries': 'Executing subqueries',
            'subqueries_completed': 'Subqueries completed',
            'synthesizing_context': 'Synthesizing context',
            'context_synthesis_completed': 'Context synthesis completed',
            'generating_embedding': 'Generating embeddings',
            'performing_hybrid_search': 'Performing hybrid search',
            'searching_vector_store': 'Searching vector store',
            'search_completed': 'Search completed',
            'applying_popularity_boost': 'Applying popularity boost',
            'applying_query_pattern_boost': 'Applying query pattern boost',
            're_ranking_results': 'Re-ranking results',
            're_ranking_completed': 'Re-ranking completed',
            'compression_applied': 'Compression applied',
            'saving_query_history': 'Saving query history',
          };
          
          const humanReadableStage = stageMap[event.stage] || event.stage;

          // Extract interesting details from metadata
          let enhancedDetails = event.details;
          if (event.metadata) {
            // Show subqueries if available
            if (event.metadata.subqueries && Array.isArray(event.metadata.subqueries)) {
              const subqueryList = event.metadata.subqueries.slice(0, 3).join(', ');
              const count = event.metadata.subqueries.length;
              enhancedDetails = `${count} subqueries: ${subqueryList}${count > 3 ? '...' : ''}`;
            }
            // Show result count if available
            else if (typeof event.metadata.resultCount === 'number') {
              enhancedDetails = `${event.metadata.resultCount} results`;
            }
            // Show chunk count if available
            else if (typeof event.metadata.chunkCount === 'number') {
              enhancedDetails = `${event.metadata.chunkCount} chunks`;
            }
          }

          if (options.onProgress) {
            options.onProgress(humanReadableStage, enhancedDetails);
          }
        } catch (error) {
          // Don't break query if progress callback fails
          // Error is silently ignored
        }
      }
    : undefined;

  // Wrap runtime to suppress INFO logs but allow WARN/ERROR
  const originalRuntime = options.runtime;
  
  const wrappedRuntime = originalRuntime ? {
    ...originalRuntime,
    log: (level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: any) => {
      // Suppress INFO and DEBUG logs - progress comes from explicit API now
      if (level === 'info' || level === 'debug') {
        return; // Don't output INFO/DEBUG logs
      }
      
      // Call original logger for warnings and errors only
      if (originalRuntime.log && (level === 'warn' || level === 'error')) {
        originalRuntime.log(level, message, meta);
      }
    },
  } : undefined;

  const runtime = await createMindRuntime({
    cwd: options.cwd,
    config: options.config,
    runtime: wrappedRuntime,
    onProgress: onProgressEvent,
    platform: options.platform,
  });
  
  options.onProgress?.('Initializing Mind runtime');

  const defaultScopeId = runtime.config.scopes?.[0]?.id;
  const scopeId = options.scopeId ?? defaultScopeId;
  if (!scopeId) {
    throw new Error(
      'No mind scopes configured. Provide at least one scope in kb.config.json.',
    );
  }

  options.onProgress?.('Preparing query', `scope: ${scopeId}`);

  options.onProgress?.('Searching Mind index');

  const result = await runtime.service.query({
    productId: MIND_PRODUCT_ID,
    intent: options.intent ?? 'summary',
    scopeId,
    text: options.text,
    limit: options.limit,
    profileId: options.profileId,
  });

  options.onProgress?.('Processing results', `${result.chunks.length} chunks found`);

  return {
    scopeId,
    result,
  };
}

// === Agent-optimized RAG Query ===

export interface AgentRagQueryOptions {
  cwd: string;
  scopeId?: string;
  text: string;
  mode?: AgentQueryMode;
  indexRevision?: string;
  engineConfigHash?: string;
  sourcesDigest?: string;
  debug?: boolean;
  runtime?: Parameters<typeof createMindRuntime>[0]['runtime'];
  broker?: any; // StateBroker-like interface (duck typing to avoid circular deps)
  platform?: PlatformServices;
  /**
   * Mind configuration (from ctx.config)
   * If provided, will be used instead of reading from file
   */
  config?: any;
}

export type AgentRagQueryResult = AgentResponse | AgentErrorResponse;

interface CacheContext {
  indexRevision?: string;
  engineConfigHash?: string;
  sourcesDigest?: string;
}

interface ManifestCacheContext {
  found: boolean;
  indexRevision?: string;
  engineConfigHash?: string;
  sourcesDigest?: string;
}

/**
 * Run agent-optimized RAG query with orchestration.
 *
 * This function uses the orchestrator pipeline:
 * 1. Detect query complexity
 * 2. Decompose into sub-queries (auto/thinking modes)
 * 3. Gather chunks from mind-engine
 * 4. Check completeness (with retry in thinking mode)
 * 5. Synthesize agent-friendly response
 * 6. Compress if needed
 *
 * @returns AgentResponse | AgentErrorResponse - clean JSON for agents
 */
export async function runAgentRagQuery(
  options: AgentRagQueryOptions,
): Promise<AgentRagQueryResult> {
  const platformBroker = options.platform?.cache
    ? {
        get: <T>(key: string) => options.platform!.cache!.get<T>(key),
        set: <T>(key: string, value: T, ttl?: number) => options.platform!.cache!.set(key, value, ttl),
        delete: (key: string) => options.platform!.cache!.delete(key),
      }
    : undefined;

  const ragLlm = useLLM({
    execution: {
      cache: {
        mode: 'prefer',
        scope: 'segments',
      },
      stream: {
        mode: 'prefer',
        fallbackToComplete: true,
      },
    },
  });

  // Always recreate orchestrator to use fresh LLM from useLLM()
  // This ensures analytics wrappers are always applied
  globalOrchestrator = createAgentQueryOrchestrator({
    llm: ragLlm, // Fresh LLM with analytics wrapper + cache/stream policy
    broker: options.broker ?? platformBroker, // Pass broker for persistent caching
    analyticsAdapter: options.platform?.analytics ?? null,
    config: {
      mode: options.mode ?? 'auto',
      autoDetectComplexity: true,
    },
  });

  const orchestrator = globalOrchestrator;

  // Create runtime
  const runtime = await createMindRuntime({
    cwd: options.cwd,
    config: options.config,
    runtime: options.runtime,
    platform: options.platform,
  });

  // Get scope ID
  const defaultScopeId = runtime.config.scopes?.[0]?.id;
  const scopeId = options.scopeId ?? defaultScopeId;

  if (!scopeId) {
    return {
      error: {
        code: 'KNOWLEDGE_SCOPE_NOT_FOUND',
        message: 'No mind scopes configured. Provide at least one scope in kb.config.json.',
        recoverable: false,
      },
      meta: {
        schemaVersion: 'agent-response-v1',
        requestId: `rq-${Date.now()}`,
        mode: options.mode ?? 'auto',
        timingMs: 0,
        cached: false,
      },
    };
  }

  const cacheContext = await resolveCacheContext({
    cwd: options.cwd,
    scopeId,
    config: runtime.config,
    providedIndexRevision: options.indexRevision,
    providedEngineConfigHash: options.engineConfigHash,
    providedSourcesDigest: options.sourcesDigest,
  });

  // Create query function for orchestrator with adaptive weights support
  const queryFn = async (queryOptions: {
    text: string;
    intent?: MindIntent;
    limit?: number;
    vectorWeight?: number;
    keywordWeight?: number;
  }) => {
    const result = await runtime.service.query({
      productId: MIND_PRODUCT_ID,
      intent: queryOptions.intent ?? 'search',
      scopeId,
      text: queryOptions.text,
      limit: queryOptions.limit,
      // Pass adaptive weights via metadata for mind-engine to use
      metadata: {
        agentMode: true,
        consumer: 'agent',
        mode: options.mode ?? 'auto',
        ...(queryOptions.vectorWeight !== undefined && queryOptions.keywordWeight !== undefined
          ? {
              vectorWeight: queryOptions.vectorWeight,
              keywordWeight: queryOptions.keywordWeight,
            }
          : {}),
      },
    });

    return {
      chunks: result.chunks,
      metadata: result.metadata ?? {},
    };
  };

  // Execute orchestrated query
  return orchestrator.query(
    {
      cwd: options.cwd,
      scopeId,
      text: options.text,
      mode: options.mode,
      indexRevision: cacheContext.indexRevision,
      engineConfigHash: cacheContext.engineConfigHash,
      sourcesDigest: cacheContext.sourcesDigest,
      debug: options.debug,
    },
    queryFn,
  );
}

async function resolveCacheContext(options: {
  cwd: string;
  scopeId: string;
  config: any;
  providedIndexRevision?: string;
  providedEngineConfigHash?: string;
  providedSourcesDigest?: string;
}): Promise<CacheContext> {
  const manifestContext = await readCacheContextFromManifest(options.cwd, options.config, options.scopeId);

  const indexRevision = options.providedIndexRevision
    ?? manifestContext.indexRevision;
  const engineConfigHash = options.providedEngineConfigHash
    ?? manifestContext.engineConfigHash
    ?? computeEngineConfigHash(options.config, options.scopeId);
  const sourcesDigest = options.providedSourcesDigest
    ?? manifestContext.sourcesDigest;

  return {
    indexRevision,
    engineConfigHash,
    sourcesDigest,
  };
}

function computeEngineConfigHash(config: any, scopeId: string): string | undefined {
  const scope = Array.isArray(config?.scopes)
    ? config.scopes.find((item: any) => item?.id === scopeId)
    : undefined;
  const engineId = scope?.defaultEngine
    ?? config?.defaults?.fallbackEngineId
    ?? config?.engines?.[0]?.id;
  const engine = Array.isArray(config?.engines)
    ? config.engines.find((item: any) => item?.id === engineId)
    : undefined;

  if (!engine) {
    return undefined;
  }

  const sanitized = {
    id: engine.id,
    type: engine.type,
    options: sanitizeEngineOptionsForHash(engine.options ?? {}),
  };

  return createHash('sha256').update(stableStringify(sanitized)).digest('hex');
}

async function readCacheContextFromManifest(
  cwd: string,
  config: any,
  scopeId: string,
): Promise<ManifestCacheContext> {
  const scope = Array.isArray(config?.scopes)
    ? config.scopes.find((item: any) => item?.id === scopeId)
    : undefined;
  const engineId = scope?.defaultEngine
    ?? config?.defaults?.fallbackEngineId
    ?? config?.engines?.[0]?.id;
  const engine = Array.isArray(config?.engines)
    ? config.engines.find((item: any) => item?.id === engineId)
    : undefined;
  const configuredIndexDir = typeof engine?.options?.indexDir === 'string'
    ? engine.options.indexDir
    : '.kb/mind/rag';

  const candidatePaths = [
    path.resolve(cwd, configuredIndexDir, scopeId, 'manifest.json'),
    path.resolve(cwd, configuredIndexDir, 'manifest.json'),
    path.resolve(cwd, '.kb/mind/indexes', scopeId, 'manifest.json'),
    path.resolve(cwd, '.kb/mind/rag', scopeId, 'manifest.json'),
  ];

  for (const manifestPath of candidatePaths) {
    try {
      const manifest = await loadManifest(manifestPath);
      const indexRevision = (manifest as { indexRevision?: unknown }).indexRevision;
      const engineConfigHash = (manifest as { engineConfigHash?: unknown }).engineConfigHash;
      const sourcesDigest = (manifest as { sourcesDigest?: unknown }).sourcesDigest;

      if (typeof indexRevision !== 'string' || indexRevision.length === 0) {
        throw new Error('missing indexRevision');
      }

      if (typeof engineConfigHash !== 'string' || engineConfigHash.length === 0) {
        throw new Error('missing engineConfigHash');
      }
      if (typeof sourcesDigest !== 'string' || sourcesDigest.length === 0) {
        throw new Error('missing sourcesDigest');
      }

      return {
        found: true,
        indexRevision,
        engineConfigHash,
        sourcesDigest,
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code === 'ENOENT') {
        continue;
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid index manifest at ${manifestPath}: ${message}`);
    }
  }

  return { found: false };
}

function sanitizeEngineOptionsForHash(options: Record<string, unknown>): Record<string, unknown> {
  const {
    _runtime: _runtimeIgnored,
    onProgress: _onProgressIgnored,
    platform: _platformIgnored,
    ...rest
  } = options as Record<string, unknown>;
  return rest;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortObjectDeep(value));
}

function sortObjectDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObjectDeep);
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => [key, sortObjectDeep(val)] as const);
    return Object.fromEntries(entries);
  }
  return value;
}
