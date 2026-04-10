// TODO: docs/tasks/TASK-003-mind-engine-index-splitting.md
// This file is 2,350 lines (10x max recommended). Split into focused modules.
import {
  usePlatform,
  useLogger,
  useLLM,
  useEmbeddings,
  MemoryHistoryStore,
  MemoryFeedbackStore,
  FileHistoryStore,
  FileFeedbackStore,
  type ILLM,
} from '@kb-labs/sdk';
import type {
  KnowledgeChunk,
  KnowledgeEngineConfig,
  KnowledgeQuery,
  KnowledgeResult,
  KnowledgeSource,
  SpanRange,
  KnowledgeEngine,
  KnowledgeEngineFactory,
  KnowledgeEngineFactoryContext,
  KnowledgeEngineRegistry,
  KnowledgeExecutionContext,
  KnowledgeIndexOptions,
  IndexingStats,
} from './types/engine-contracts';
import { createKnowledgeError } from './types/engine-contracts';
import * as path from 'node:path';
import fs from 'fs-extra';
import fg from 'fast-glob';
import picomatch from 'picomatch';
import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { getChunkerForFile, type Chunk } from './chunking/index';

// Use SDK logger (lazy initialization)
const getEngineLogger = () => useLogger().child({ category: 'mind:engine' });
const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => getEngineLogger().debug(msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => getEngineLogger().info(msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => getEngineLogger().warn(msg, meta),
  error: (msg: string, errorOrMeta?: Error | Record<string, unknown>, meta?: Record<string, unknown>) => {
    if (errorOrMeta instanceof Error) {
      getEngineLogger().error(msg, errorOrMeta, meta);
    } else {
      getEngineLogger().error(msg, undefined, errorOrMeta);
    }
  },
};
import type {
  EmbeddingProvider,
  EmbeddingProviderConfig,
} from './types/embedding-provider';
import type { VectorSearchFilters, VectorSearchMatch } from './vector-store/vector-store';
import type { RuntimeAdapter } from './adapters/runtime-adapter';
import { createRuntimeAdapter } from './adapters/runtime-adapter';
import { createVectorStore, type VectorStoreConfig } from './vector-store/index';
import type { VectorStore } from './vector-store/vector-store';
import { adaptiveHybridSearch } from './search/adaptive-hybrid';
import {
  applyFreshnessRanking,
  resolveRetrievalMode,
} from './search/freshness';
import { applyConflictResolution } from './search/conflicts';
import { buildConfidenceAdjustments, evaluateReliability } from './search/reliability';
import { createReranker, type RerankerConfig } from './reranking/index';
import type { Reranker } from './reranking/reranker';
import { ContextOptimizer } from './optimization/index';
import type { LLMCompressor } from './compression/llm-compressor';
import { OpenAILLMCompressor } from './compression/openai-compressor';
import { ChunkSummarizer } from './compression/summarizer';
import { ComplexityDetector } from './reasoning/complexity-detector';
import { QueryPlanner } from './reasoning/query-planner';
import { ParallelExecutor } from './reasoning/parallel-executor';
import { ResultSynthesizer } from './reasoning/synthesizer';
import { ReasoningEngine } from './reasoning/reasoning-engine';
import type { QueryHistoryStore, QueryHistoryEntry } from './learning/query-history';
import type { FeedbackStore, FeedbackEntry } from './learning/feedback';
import { SelfFeedbackGenerator } from './learning/feedback';
import { PlatformHistoryStoreAdapter } from './learning/platform-history-store';
import { PlatformFeedbackStoreAdapter } from './learning/platform-feedback-store';
import {
  PopularityBoostCalculator,
  type PopularityBoost,
} from './learning/popularity';
import {
  QueryPatternMatcher,
  applyPatternBoost,
  type QueryPatternMatcher as IQueryPatternMatcher,
} from './learning/query-patterns';
import {
  AdaptiveWeightCalculator,
  type AdaptiveWeights,
} from './learning/adaptive-weights';
import {
  PlatformEmbeddingProvider,
  type MindPlatformBindings,
} from './platform/platform-adapters';
import { AdaptiveChunkerFactory } from './chunking/adaptive-factory';
import { MemoryMonitor } from './indexing/memory-monitor';
import { IndexingPipeline } from './indexing/pipeline';
import { FileDiscoveryStage } from './indexing/stages/discovery';
import { FileFilteringStage } from './indexing/stages/filtering';
import { ParallelChunkingStage } from './indexing/stages/parallel-chunking';
import { EmbeddingStage } from './indexing/stages/embedding';
import { StorageStage } from './indexing/stages/storage';

const DEFAULT_INDEX_DIR = '.kb/mind/rag';
const DEFAULT_CODE_CHUNK_LINES = 120;
const DEFAULT_DOC_CHUNK_LINES = 80;
const DEFAULT_CHUNK_OVERLAP = 20;

/**
 * Progress event for tracking query execution stages
 */
export interface ProgressEvent {
  /** Stage name (e.g., 'generating_embedding', 'searching_vector_store') */
  stage: string;
  /** Human-readable details (e.g., '15 matches', '3 subqueries') */
  details?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Timestamp in milliseconds */
  timestamp: number;
}

export interface MindEngineChunkOptions {
  codeLines?: number;
  docLines?: number;
  overlap?: number;
}

export interface MindEngineEmbeddingOptions {
  type?: 'auto' | 'openai' | 'local' | 'deterministic';
  dimension?: number;
  provider?: EmbeddingProviderConfig['provider'];
}

export interface MindEngineVectorStoreOptions {
  type?: 'local';
  local?: VectorStoreConfig['local'];
}

export interface MindEngineSearchOptions {
  /**
   * Enable hybrid search (vector + keyword)
   * Default: false (vector only)
   */
  hybrid?: boolean;

  /**
   * Weight for vector search in hybrid mode (0-1)
   * Default: 0.7
   */
  vectorWeight?: number;

  /**
   * Weight for keyword search in hybrid mode (0-1)
   * Default: 0.3
   */
  keywordWeight?: number;

  /**
   * RRF constant for hybrid search
   * Default: 60
   */
  rrfK?: number;

  /**
   * Freshness-aware ranking adjustments.
   * Helps prioritize newer docs/ADR chunks over stale ones.
   */
  freshness?: {
    /**
     * Enable freshness adjustments.
     * Default: true
     */
    enabled?: boolean;

    /**
     * Freshness weight for docs/ADR-like chunks.
     * Default: 0.25
     */
    docsWeight?: number;

    /**
     * Freshness weight for code/config chunks.
     * Default: 0.1
     */
    codeWeight?: number;

    /**
     * Source trust weight.
     * Default: 0.1
     */
    trustWeight?: number;

    /**
     * Hard cap for total boost added to base score.
     * Default: 0.3
     */
    maxBoost?: number;

    /**
     * Index staleness thresholds in hours.
     */
    staleThresholdHours?: {
      /**
       * Soft threshold (warning level).
       * Default: 72
       */
      soft?: number;

      /**
       * Hard threshold (critical stale level).
       * Default: 168
       */
      hard?: number;
    };
  };

  /**
   * Conflict resolution across docs/ADR candidates.
   */
  conflicts?: {
    /**
     * Enable deterministic conflict handling.
     * Default: true
     */
    enabled?: boolean;

    /**
     * Conflict resolution policy.
     * Default: 'freshness-first'
     */
    policy?: 'freshness-first';

    /**
     * Max losers to penalize in one topic group.
     * Default: 3
     */
    maxLosersPerTopic?: number;

    /**
     * Score penalty applied to loser chunks.
     * Default: 0.2
     */
    penalty?: number;
  };

  /**
   * Reliability policies for agent/thinking consumers.
   */
  reliability?: {
    /**
     * Fail-closed when staleness is hard and mode is strict.
     * Default: true
     */
    hardStaleFailClosed?: boolean;

    /**
     * Confidence floor for strict mode.
     * Default: 0.75
     */
    confidenceFloor?: number;

    /**
     * Treat thinking mode as strict.
     * Default: true
     */
    thinkingModeStrict?: boolean;
  };

  /**
   * Re-ranking configuration
   */
  reranking?: {
    /**
     * Re-ranker type: 'cross-encoder' | 'heuristic' | 'none'
     * Default: 'none'
     */
    type?: 'cross-encoder' | 'heuristic' | 'none';

    /**
     * Cross-encoder options (when type is 'cross-encoder')
     */
    crossEncoder?: {
      endpoint?: string;
      apiKey?: string;
      model?: string;
      batchSize?: number;
      timeout?: number;
    };

    /**
     * Top-K candidates to re-rank
     * Default: 20
     */
    topK?: number;

    /**
     * Minimum score threshold
     * Default: 0
     */
    minScore?: number;
  };

  /**
   * Self-learning configuration
   */
  learning?: {
    /**
     * Enable self-learning features
     * Default: false
     */
    enabled?: boolean;

    /**
     * Store query history
     * Default: true (when learning enabled)
     */
    queryHistory?: boolean;

    /**
     * Enable feedback collection (implicit + self-feedback)
     * Default: true (when learning enabled)
     */
    feedback?: boolean;

    /**
     * Enable popularity boost
     * Default: true (when learning enabled)
     */
    popularityBoost?: boolean;

    /**
     * Enable query pattern learning
     * Default: true (when learning enabled)
     */
    queryPatterns?: boolean;

    /**
     * Enable adaptive weights
     * Default: false (requires more data)
     */
    adaptiveWeights?: boolean;

    /**
     * Storage backend for learning data
     * Default: 'memory'
     */
    storage?: 'memory';
  };

  /**
   * Context optimization configuration
   */
  optimization?: {
    /**
     * Enable deduplication
     * Default: true
     */
    deduplication?: boolean;

    /**
     * Similarity threshold for deduplication (0-1)
     * Default: 0.9
     */
    deduplicationThreshold?: number;

    /**
     * Enable diversification
     * Default: true
     */
    diversification?: boolean;

    /**
     * Diversity threshold (0-1)
     * Default: 0.3
     */
    diversityThreshold?: number;

    /**
     * Maximum chunks per file
     * Default: 3
     */
    maxChunksPerFile?: number;

    /**
     * Enable adaptive selection based on token budget
     * Default: false
     */
    adaptiveSelection?: boolean;

    /**
     * Average tokens per chunk (for estimation)
     * Default: 200
     */
    avgTokensPerChunk?: number;

    /**
     * Compression configuration for token optimization
     */
    compression?: {
      /**
       * Enable compression features
       * Default: false
       */
      enabled?: boolean;

      /**
       * Cache strategy for compressed chunks
       * 'memory' - in-memory cache for the duration of a query
       * Default: 'memory'
       */
      cache?: 'memory';

      /**
       * Smart truncation configuration
       */
      smartTruncation?: {
        /**
         * Enable smart truncation with context preservation
         * Default: true (when compression enabled)
         */
        enabled?: boolean;

        /**
         * Maximum length for chunks before truncation
         * Default: 2000 characters
         */
        maxLength?: number;

        /**
         * Preserve code structure (function signatures, types, etc.)
         * Default: true
         */
        preserveStructure?: boolean;
      };

      /**
       * Metadata-only mode for low-score chunks
       */
      metadataOnly?: {
        /**
         * Enable metadata-only mode
         * Default: true (when compression enabled)
         */
        enabled?: boolean;

        /**
         * Score threshold below which chunks are shown as metadata-only
         * Default: 0.4
         */
        scoreThreshold?: number;
      };

      /**
       * LLM compression configuration (future)
       */
      llm?: {
        /**
         * Enable LLM-based compression
         * Default: false (not implemented yet)
         */
        enabled?: boolean;

        /**
         * LLM model to use for compression
         */
        model?: string;

        /**
         * Maximum tokens for compressed output
         */
        maxTokens?: number;
      };
    };
  };

  /**
   * Reasoning chain configuration
   */
  reasoning?: {
    /**
     * Enable reasoning chain for complex queries
     * Default: false
     */
    enabled?: boolean;

    /**
     * Complexity threshold above which reasoning is triggered (0-1)
     * Default: 0.6
     */
    complexityThreshold?: number;

    /**
     * Maximum depth for recursive reasoning
     * Default: 3
     */
    maxDepth?: number;

    /**
     * Complexity detection configuration
     */
    complexityDetection?: {
      /**
       * Enable heuristic-based detection
       * Default: true
       */
      heuristics?: boolean;

      /**
       * Enable LLM-based detection
       * Default: false
       */
      llmBased?: boolean;

      /**
       * LLM model for complexity detection
       */
      llmModel?: string;
    };

    /**
     * Query planning configuration
     */
    planning?: {
      /**
       * Maximum number of sub-queries to generate
       * Default: 5
       */
      maxSubqueries?: number;

      /**
       * LLM model for planning
       */
      model?: string;

      /**
       * Temperature for LLM
       * Default: 0.3
       */
      temperature?: number;

      /**
       * Minimum similarity threshold for sub-queries
       * Default: 0.85
       */
      minSimilarity?: number;
    };

    /**
     * Execution configuration
     */
    execution?: {
      /**
       * Enable parallel execution
       * Default: true
       */
      parallel?: boolean;

      /**
       * Maximum concurrent queries
       * Default: 3
       */
      maxConcurrency?: number;

      /**
       * Timeout per query in milliseconds
       * Default: 30000
       */
      timeoutMs?: number;

      /**
       * Early stopping configuration
       */
      earlyStopping?: {
        /**
         * Enable early stopping
         * Default: true
         */
        enabled?: boolean;

        /**
         * Minimum confidence score to stop early
         * Default: 0.8
         */
        minConfidence?: number;

        /**
         * Minimum chunks found to stop early
         * Default: 5
         */
        minChunksFound?: number;
      };
    };

    /**
     * Synthesis configuration
     */
    synthesis?: {
      /**
       * Enable synthesis
       * Default: true
       */
      enabled?: boolean;

      /**
       * Enable deduplication
       * Default: true
       */
      deduplication?: boolean;

      /**
       * Maximum tokens for synthesized output
       * Default: 4000
       */
      maxTokens?: number;

      /**
       * LLM model for synthesis
       */
      model?: string;

      /**
       * Temperature for LLM
       * Default: 0.2
       */
      temperature?: number;

      /**
       * Enable progressive refinement
       * Default: true
       */
      progressiveRefinement?: boolean;
    };

    /**
     * Safety limits
     */
    safetyLimits?: {
      /**
       * Maximum total queries across all depths
       * Default: 20
       */
      maxTotalQueries?: number;

      /**
       * Maximum tokens per depth level
       * Default: 10000
       */
      maxTokensPerDepth?: number;

      /**
       * Enable cyclic detection
       * Default: true
       */
      cyclicDetection?: boolean;
    };
  };
}

export interface MindEngineOptions {
  indexDir?: string;
  chunk?: MindEngineChunkOptions;
  embedding?: MindEngineEmbeddingOptions;
  vectorStore?: MindEngineVectorStoreOptions;
  search?: MindEngineSearchOptions;
  learning?: MindEngineSearchOptions['learning'];
  llmEngineId?: string;
  platform?: MindPlatformBindings;
  /**
   * Progress callback for tracking query execution stages
   */
  onProgress?: (event: ProgressEvent) => void;
  /**
   * Runtime adapter for sandbox Runtime API
   * Passed through options to avoid changing knowledge-core interfaces
   * @internal
   */
  _runtime?: RuntimeAdapter | {
    fetch?: (input: string | { url: string } | { href: string }, init?: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      signal?: { aborted: boolean } | null;
      [key: string]: unknown;
    }) => Promise<{
      ok: boolean;
      status: number;
      text(): Promise<string>;
      json(): Promise<unknown>;
      [key: string]: unknown;
    }>;
    fs?: any;
    env?: (key: string) => string | undefined;
    log?: (
      level: 'debug' | 'info' | 'warn' | 'error',
      msg: string,
      meta?: Record<string, unknown>,
    ) => void;
    analytics?: {
      track(event: string, properties?: Record<string, unknown>): void;
      metric(name: string, value: number, tags?: Record<string, string>): void;
    };
  };
}

interface NormalizedOptions {
  indexDir: string;
  chunk: Required<MindEngineChunkOptions>;
  search: {
    hybrid: boolean;
    vectorWeight: number;
    keywordWeight: number;
    rrfK: number;
    freshness: {
      enabled: boolean;
      docsWeight: number;
      codeWeight: number;
      trustWeight: number;
      maxBoost: number;
      staleThresholdHours: {
        soft: number;
        hard: number;
      };
    };
    conflicts: {
      enabled: boolean;
      policy: 'freshness-first';
      maxLosersPerTopic: number;
      penalty: number;
    };
    reliability: {
      hardStaleFailClosed: boolean;
      confidenceFloor: number;
      thinkingModeStrict: boolean;
    };
    reranking: {
      enabled: boolean;
      type: 'cross-encoder' | 'heuristic' | 'none';
      topK: number;
      minScore: number;
      config?: RerankerConfig;
    };
    optimization: {
      enabled: boolean;
      deduplication: boolean;
      deduplicationThreshold: number;
      diversification: boolean;
      diversityThreshold: number;
      maxChunksPerFile: number;
      adaptiveSelection: boolean;
      avgTokensPerChunk: number;
      compression: {
        enabled: boolean;
        cache: 'memory';
        smartTruncation: {
          enabled: boolean;
          maxLength: number;
          preserveStructure: boolean;
        };
        metadataOnly: {
          enabled: boolean;
          scoreThreshold: number;
        };
        llm: {
          enabled: boolean;
          model?: string;
          maxTokens?: number;
        };
      };
    };
    reasoning: {
      enabled: boolean;
      complexityThreshold: number;
      maxDepth: number;
      complexityDetection: {
        heuristics: boolean;
        llmBased: boolean;
        llmModel?: string;
      };
      planning: {
        maxSubqueries: number;
        model?: string;
        temperature: number;
        minSimilarity: number;
      };
      execution: {
        parallel: boolean;
        maxConcurrency: number;
        timeoutMs: number;
        earlyStopping: {
          enabled: boolean;
          minConfidence: number;
          minChunksFound: number;
        };
      };
      synthesis: {
        enabled: boolean;
        deduplication: boolean;
        maxTokens: number;
        model?: string;
        temperature: number;
        progressiveRefinement: boolean;
      };
      safetyLimits: {
        maxTotalQueries: number;
        maxTokensPerDepth: number;
        cyclicDetection: boolean;
      };
    };
  };
  learning: {
    enabled: boolean;
    queryHistory: boolean;
    feedback: boolean;
    popularityBoost: boolean;
    queryPatterns: boolean;
    adaptiveWeights: boolean;
    storage: 'platform' | 'memory';
    storageOptions?: {
      history?: {
        basePath?: string;
        maxRecordsPerFile?: number;
        maxFiles?: number;
      };
      feedback?: {
        basePath?: string;
        maxRecordsPerFile?: number;
        maxFiles?: number;
      };
    };
  };
}

interface MindChunk {
  chunkId: string;
  sourceId: string;
  path: string;
  span: SpanRange;
  text: string;
  metadata?: Record<string, unknown>;
}

export class MindEngine implements KnowledgeEngine {
  readonly id: string;
  readonly type = 'mind';
  private readonly workspaceRoot: string;
  private readonly engineConfigHash: string;
  private readonly options: NormalizedOptions;
  private readonly vectorStore: VectorStore;
  private embeddingProvider: EmbeddingProvider;
  private readonly llm: ILLM | null;
  private readonly runtime: RuntimeAdapter;
  private readonly reranker: Reranker | null;
  private readonly contextOptimizer: ContextOptimizer;
  private readonly llmCompressor: LLMCompressor | null;
  private readonly summarizer: ChunkSummarizer | null;
  
  // Self-learning components
  private readonly queryHistory: QueryHistoryStore | null;
  private readonly feedbackStore: FeedbackStore | null;
  private readonly popularityBoost: PopularityBoost | null;
  private readonly queryPatternMatcher: IQueryPatternMatcher | null;
  private readonly adaptiveWeights: AdaptiveWeights | null;
  private readonly selfFeedbackGenerator: SelfFeedbackGenerator | null;
  
  // Reasoning components
  private readonly reasoningEngine: ReasoningEngine | null;
  
  // Progress tracking
  private readonly onProgress?: (event: ProgressEvent) => void;

  /**
   * Safely call onProgress callback with error handling
   */
  private reportProgress(stage: string, details?: string, metadata?: Record<string, unknown>): void {
    if (!this.onProgress) {return;}
    try {
      this.onProgress({
        stage,
        details,
        metadata,
        timestamp: Date.now(),
      });
    } catch (error) {
      // Log error but don't break the query
      this.runtime.log?.('warn', 'Progress callback failed', {
        error: error instanceof Error ? error.message : String(error),
        stage,
      });
    }
  }

  constructor(
    config: KnowledgeEngineConfig,
    context: KnowledgeEngineFactoryContext,
  ) {
    this.id = config.id;
    this.workspaceRoot = context.workspaceRoot ?? (typeof process !== 'undefined' && process.cwd ? process.cwd() : '/');
    const rawOptions = (config.options ?? {}) as MindEngineOptions;
    this.options = normalizeOptions(rawOptions);
    this.engineConfigHash = hashConfigForDeterminism({
      id: config.id,
      type: config.type,
      options: sanitizeEngineOptionsForHash(rawOptions),
    });

    // Use SDK's usePlatform() as fallback if not explicitly provided
    const platform = rawOptions.platform ?? usePlatform();

    // DEBUG: Check learning configuration
    platform?.logger?.debug('MindEngine constructor: Raw learning config', { learning: rawOptions.learning });
    platform?.logger?.debug('MindEngine constructor: Normalized learning.enabled', { enabled: this.options.learning.enabled });

    this.onProgress = rawOptions.onProgress;

    // Extract runtime adapter from options (passed through from handlers)
    const runtimeInput = rawOptions._runtime;
    this.runtime = runtimeInput && 'fetch' in runtimeInput && typeof runtimeInput.fetch === 'function'
      ? runtimeInput as RuntimeAdapter
      : createRuntimeAdapter(runtimeInput as any);

    // DEBUG: Check platform.vectorStore
    platform?.logger?.debug('MindEngine: platform source', { source: rawOptions.platform ? 'rawOptions.platform' : 'usePlatform()' });
    platform?.logger?.debug('MindEngine: platform.vectorStore exists', { exists: !!platform?.vectorStore });
    platform?.logger?.debug('MindEngine: platform.vectorStore type', { type: platform?.vectorStore?.constructor?.name });

    const embeddingConfig: EmbeddingProviderConfig = rawOptions.embedding
      ? {
          type: rawOptions.embedding.type,
          provider: rawOptions.embedding.provider,
        }
      : { type: 'deterministic' };
    
    // Infer dimension: prefer platform embeddings dimension, otherwise fallback to config/deterministic
    let embeddingDimension = platform?.embeddings?.dimensions ?? 384;
    if (!platform?.embeddings) {
      if (embeddingConfig.type === 'openai') {
        embeddingDimension = 1536;
      } else if (embeddingConfig.type === 'deterministic') {
        embeddingDimension = embeddingConfig.provider?.deterministic?.dimension ?? 384;
      } else if (embeddingConfig.type === 'local') {
        embeddingDimension = embeddingConfig.provider?.local?.dimension ?? 384;
      }
    }
    
    // Create vector store using platform abstraction when provided
    const vectorStoreConfig: VectorStoreConfig = {
      type: 'local',
      local: {
        indexDir: path.resolve(this.workspaceRoot, this.options.indexDir),
      },
    };
    
    this.vectorStore = createVectorStore(vectorStoreConfig);

    // Create embedding provider - ALWAYS use platform.embeddings (with analytics wrapper)
    const embeddings = platform?.embeddings ?? useEmbeddings();
    if (!embeddings) {
      throw new Error('Embeddings adapter not available. Ensure platform is initialized with embeddings adapter.');
    }
    this.embeddingProvider = new PlatformEmbeddingProvider(embeddings);
    
    // Use LLM from SDK hook with cache/stream policy for mind RAG internals
    this.llm = useLLM({
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
    }) ?? null;

    // Create LLM compressor if enabled and LLM available
    if (this.options.search.optimization.compression.llm.enabled && this.llm) {
      this.llmCompressor = new OpenAILLMCompressor({
        llm: this.llm,
        maxTokens: this.options.search.optimization.compression.llm.maxTokens,
        compressionRatio: 0.5,
        temperature: 0.2,
      });
      this.summarizer = new ChunkSummarizer({
        llm: this.llm,
        maxTokens: 150,
        temperature: 0.3,
      });
    } else {
      this.llmCompressor = null;
      this.summarizer = null;
    }

    // Create reranker if enabled
    if (this.options.search.reranking.enabled && this.options.search.reranking.config) {
      this.reranker = createReranker(this.options.search.reranking.config, this.runtime);
    } else {
      this.reranker = null;
    }

    // Create context optimizer
    this.contextOptimizer = new ContextOptimizer();

    // Initialize self-learning components if enabled
    if (this.options.learning.enabled) {
      const storageType = this.options.learning.storage;
      const resolvedStorage = platform?.storage;

      this.runtime.log?.('debug', 'Initializing self-learning system', {
        enabled: this.options.learning.enabled,
        storageType,
        platformStorage: !!platform?.storage,
        resolvedStorage: !!resolvedStorage,
        workspaceRoot: this.workspaceRoot,
      });

      // Initialize query history (platform/fallback storage -> file store; otherwise memory)
      if (this.options.learning.queryHistory) {
        const historyConfig = this.options.learning.storageOptions?.history;
        const historyStoreImpl = storageType === 'platform' && resolvedStorage
          ? new FileHistoryStore(resolvedStorage, {
              basePath: historyConfig?.basePath ?? '.kb/mind/learning/history/',
              maxRecordsPerFile: historyConfig?.maxRecordsPerFile ?? 1000,
              maxFiles: historyConfig?.maxFiles ?? 30,
            })
          : new MemoryHistoryStore();
        this.queryHistory = new PlatformHistoryStoreAdapter(historyStoreImpl);
      } else {
        this.queryHistory = null;
      }

      // Initialize feedback store (platform/fallback storage -> file store; otherwise memory)
      if (this.options.learning.feedback) {
        const feedbackConfig = this.options.learning.storageOptions?.feedback;
        const feedbackStoreImpl = storageType === 'platform' && resolvedStorage
          ? new FileFeedbackStore(resolvedStorage, {
              basePath: feedbackConfig?.basePath ?? '.kb/mind/learning/feedback/',
              maxRecordsPerFile: feedbackConfig?.maxRecordsPerFile ?? 1000,
              maxFiles: feedbackConfig?.maxFiles ?? 30,
            })
          : new MemoryFeedbackStore();
        this.feedbackStore = new PlatformFeedbackStoreAdapter(feedbackStoreImpl);
      } else {
        this.feedbackStore = null;
      }

      // Initialize popularity boost
      if (this.options.learning.popularityBoost && this.feedbackStore) {
        this.popularityBoost = new PopularityBoostCalculator(this.feedbackStore);
      } else {
        this.popularityBoost = null;
      }

      // Initialize query pattern matcher
      if (this.options.learning.queryPatterns && this.queryHistory) {
        this.queryPatternMatcher = new QueryPatternMatcher(this.queryHistory);
      } else {
        this.queryPatternMatcher = null;
      }

      // Initialize adaptive weights
      if (this.options.learning.adaptiveWeights && this.queryHistory && this.feedbackStore) {
        this.adaptiveWeights = new AdaptiveWeightCalculator(this.queryHistory, this.feedbackStore);
      } else {
        this.adaptiveWeights = null;
      }

      // Initialize self-feedback generator
      if (this.options.learning.feedback) {
        this.selfFeedbackGenerator = new SelfFeedbackGenerator(this.runtime);
      } else {
        this.selfFeedbackGenerator = null;
      }
    } else {
      this.queryHistory = null;
      this.feedbackStore = null;
      this.popularityBoost = null;
      this.queryPatternMatcher = null;
      this.adaptiveWeights = null;
      this.selfFeedbackGenerator = null;
    }

    // Initialize reasoning engine if enabled
    if (this.options.search.reasoning.enabled) {
      const complexityDetector = new ComplexityDetector(
        {
          threshold: this.options.search.reasoning.complexityThreshold,
          heuristics: this.options.search.reasoning.complexityDetection.heuristics,
          llmBased: this.options.search.reasoning.complexityDetection.llmBased,
          llmModel: this.options.search.reasoning.complexityDetection.llmModel,
        },
        this.llm,
      );

      const queryPlanner = new QueryPlanner(
        {
          maxSubqueries: this.options.search.reasoning.planning.maxSubqueries,
          model: this.options.search.reasoning.planning.model,
          temperature: this.options.search.reasoning.planning.temperature,
          minSimilarity: this.options.search.reasoning.planning.minSimilarity,
        },
        this.llm,
      );

      const parallelExecutor = new ParallelExecutor({
        parallel: this.options.search.reasoning.execution.parallel,
        maxConcurrency: this.options.search.reasoning.execution.maxConcurrency,
        timeoutMs: this.options.search.reasoning.execution.timeoutMs,
        earlyStopping: this.options.search.reasoning.execution.earlyStopping,
      });

      const synthesizer = new ResultSynthesizer(
        {
          enabled: this.options.search.reasoning.synthesis.enabled,
          deduplication: this.options.search.reasoning.synthesis.deduplication,
          maxTokens: this.options.search.reasoning.synthesis.maxTokens,
          model: this.options.search.reasoning.synthesis.model,
          temperature: this.options.search.reasoning.synthesis.temperature,
          progressiveRefinement: this.options.search.reasoning.synthesis.progressiveRefinement,
        },
        this.llm,
      );

      this.reasoningEngine = new ReasoningEngine(
        {
          maxDepth: this.options.search.reasoning.maxDepth,
          maxTotalQueries: this.options.search.reasoning.safetyLimits.maxTotalQueries,
          maxTokensPerDepth: this.options.search.reasoning.safetyLimits.maxTokensPerDepth,
          cyclicDetection: this.options.search.reasoning.safetyLimits.cyclicDetection,
          onProgress: this.onProgress,
        },
        complexityDetector,
        queryPlanner,
        parallelExecutor,
        synthesizer,
        this.contextOptimizer,
        this.llmCompressor,
        this.queryHistory,
        this.runtime,
      );

      this.runtime.log?.('debug', 'Reasoning engine initialized', {
        maxDepth: this.options.search.reasoning.maxDepth,
        complexityThreshold: this.options.search.reasoning.complexityThreshold,
        maxSubqueries: this.options.search.reasoning.planning.maxSubqueries,
        maxConcurrency: this.options.search.reasoning.execution.maxConcurrency,
      });
    } else {
      this.reasoningEngine = null;
    }
  }

  async init(options?: MindEngineOptions): Promise<void> {
    // REMOVED: Fallback embedding provider creation
    // Mind MUST use only platform.embeddings (PlatformEmbeddingProvider)
    // No alternatives allowed - ensures analytics tracking works
  }

  async dispose(): Promise<void> {
    // No-op for now. Placeholder for future resource cleanup.
  }

  async index(
    sources: KnowledgeSource[],
    options: KnowledgeIndexOptions,
  ): Promise<IndexingStats> {
    // Pipeline-based Indexing Architecture
    // Breaks down monolithic index() into independent, testable stages

    // Initialize components
    const memoryMonitor = new MemoryMonitor({
      memoryLimit: 4 * 1024 * 1024 * 1024, // 4GB from manifest
      warningThreshold: 0.7,
      criticalThreshold: 0.85,
      gcEnabled: !!global.gc,
    });

    const chunkerFactory = new AdaptiveChunkerFactory();

    // Use global logger (defined at module level via SDK)
    // logger is already available from module scope

    // Incremental indexing: don't clear scope, let deduplication handle updates
    // await this.vectorStore.replaceScope(options.scope.id, []);

    // Create pipeline context
    const effectiveWorkspaceRoot = options.workspaceRoot ?? this.workspaceRoot;
    const indexRevision = randomUUID();
    const indexedAt = Date.now();
    const context: any = {
      sources,
      scopeId: options.scope.id,
      workspaceRoot: effectiveWorkspaceRoot, // CRITICAL: Pass workspaceRoot for file discovery
      indexRevision,
      indexedAt,
      logger,
      memoryMonitor,
      onProgress: undefined, // TODO: wire up progress reporting
      stats: {
        filesDiscovered: 0,
        filesProcessed: 0,
        filesSkipped: 0,
        totalChunks: 0,
        startTime: Date.now(),
        errors: [],
      },
    };

    if (!this.vectorStore.createScopedAdapter) {
      throw createKnowledgeError(
        'KNOWLEDGE_ENGINE_FAILED',
        'Vector store must implement createScopedAdapter for indexing pipeline.',
      );
    }
    const vectorStoreAdapter = this.vectorStore.createScopedAdapter(options.scope.id);
    let deletedFiles = 0;
    let deletedChunks = 0;

    // Build pipeline stages
    const discoveryStage = new FileDiscoveryStage();

    // Create pipeline
    const pipeline = new IndexingPipeline({
      memoryLimit: 4 * 1024 * 1024 * 1024,
      batchSize: 20,
      continueOnError: true,
      maxErrors: 100,
    });

    // Add discovery stage
    pipeline.addStage(discoveryStage);

    // Execute discovery first to get files
    await discoveryStage.execute(context);
    const discoveredFiles = discoveryStage.getDiscoveredFiles();

    // Stale lifecycle cleanup: remove chunks for deleted files in current scope.
    // Skip this in partial indexing mode (--include/--exclude), otherwise we can
    // accidentally treat unscanned files as deleted and wipe most of the scope.
    const isPartialIndexMode = this.isPartialIndexMode(sources, effectiveWorkspaceRoot);
    if (!isPartialIndexMode && this.vectorStore.getAllChunks) {
      try {
        const existingChunks = await this.vectorStore.getAllChunks(options.scope.id);
        const discoveredPathSet = new Set(discoveredFiles.map(file => file.relativePath.replace(/\\/g, '/')));
        const staleChunkIds = existingChunks
          .filter(chunk => !discoveredPathSet.has(chunk.path.replace(/\\/g, '/')))
          .map(chunk => chunk.chunkId);

        if (staleChunkIds.length > 0) {
          const deleted = await vectorStoreAdapter.deleteBatch(staleChunkIds);
          deletedChunks += deleted;
          if (deleted > 0) {
            const stalePaths = new Set(
              existingChunks
                .filter(chunk => !discoveredPathSet.has(chunk.path.replace(/\\/g, '/')))
                .map(chunk => chunk.path.replace(/\\/g, '/'))
            );
            deletedFiles += stalePaths.size;
          }
          this.runtime.log?.('debug', 'Deleted stale chunks for removed files', {
            scopeId: options.scope.id,
            staleChunkIds: staleChunkIds.length,
            deleted,
            staleFilesDeleted: deletedFiles,
            indexRevision,
          });
        }
      } catch (error) {
        this.runtime.log?.('warn', 'Failed stale chunk cleanup; continuing indexing', {
          scopeId: options.scope.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } else if (isPartialIndexMode) {
      this.runtime.log?.('debug', 'Skipping removed-file stale cleanup in partial indexing mode', {
        scopeId: options.scope.id,
        indexRevision,
      });
    }

    if (discoveredFiles.length === 0) {
      this.runtime.log?.('warn', `No files found for scope ${options.scope.id}`);
      return {
        filesDiscovered: 0,
        filesProcessed: 0,
        filesSkipped: 0,
        chunksStored: 0,
        chunksUpdated: 0,
        chunksSkipped: 0,
        errorCount: 0,
        durationMs: Date.now() - context.stats.startTime,
        deletedFiles,
        deletedChunks,
        invalidChunks: 0,
      } as IndexingStats;
    }

    // Add filtering stage to skip unchanged files (incremental indexing optimization)
    // Check if vectorStore supports getFilesMetadata (platform adapter does)
    const vectorStoreWithMetadata = this.vectorStore.getFilesMetadata ? this.vectorStore : null;
    const filteringStage = new FileFilteringStage(
      discoveredFiles,
      vectorStoreWithMetadata as any,
      options.scope.id,
      {
        quickFilter: true,  // Enable mtime+size quick check
        hashFilter: true,   // Enable hash-based verification
        batchSize: 100,     // Process 100 files per batch
      }
    );
    pipeline.addStage(filteringStage);

    // Execute filtering
    await filteringStage.execute(context);
    const filteredFiles = filteringStage.getFilteredFiles();

    if (filteredFiles.length === 0) {
      this.runtime.log?.('debug', `All files unchanged, skipping indexing for scope ${options.scope.id}`);
      return {
        filesDiscovered: context.stats.filesDiscovered,
        filesProcessed: 0,
        filesSkipped: context.stats.filesDiscovered,
        chunksStored: 0,
        chunksUpdated: 0,
        chunksSkipped: 0,
        errorCount: 0,
        durationMs: Date.now() - context.stats.startTime,
        deletedFiles,
        deletedChunks,
        invalidChunks: 0,
      } as IndexingStats;
    }

    this.runtime.log?.('debug', `Filtered files for indexing`, {
      totalFiles: discoveredFiles.length,
      filesToIndex: filteredFiles.length,
      skipped: discoveredFiles.length - filteredFiles.length,
    });

    // Create memory-aware parallel chunking stage with filtered files
    const chunkingStage = new ParallelChunkingStage(
      chunkerFactory,
      this.runtime,
      new Map(filteredFiles.map(f => [f.relativePath, f])),
      {
        safeThreshold: 0.75, // 75% of heap limit (was 70%)
        minConcurrency: 2,   // minimum 2 parallel (was 1)
        memoryReserve: 256 * 1024 * 1024, // 256MB (was 512MB)
      }
    );
    pipeline.addStage(chunkingStage);

    // Execute chunking
    await chunkingStage.execute(context);
    const chunks = chunkingStage.getChunks();

    if (chunks.length === 0) {
      this.runtime.log?.('warn', `No chunks generated for scope ${options.scope.id}`);
      return {
        filesDiscovered: context.stats.filesDiscovered,
        filesProcessed: context.stats.filesProcessed,
        filesSkipped: context.stats.filesSkipped,
        chunksStored: 0,
        chunksUpdated: 0,
        chunksSkipped: 0,
        errorCount: 0,
        durationMs: Date.now() - context.stats.startTime,
        deletedFiles,
        deletedChunks,
        invalidChunks: 0,
      } as IndexingStats;
    }

    // Create embedding provider adapter
    const embeddingProvider = {
      embedBatch: async (texts: string[]) => {
        // Batch embed using existing embedChunks method
        const tempChunks = texts.map((text, i) => ({
          chunkId: `temp-${i}`,
          sourceId: 'temp',
          path: 'temp',
          span: { startLine: 0, endLine: 0 },
          text,
          metadata: {},
        }));
        const embeddingVectors = await this.embedChunks(tempChunks);
        // Convert EmbeddingVector[] to number[][]
        return embeddingVectors.map((v: { values: number[] }) => v.values);
      },
      maxBatchSize: 100,
      dimension: 1536, // OpenAI default
    };

    // Create embedding stage with rate limiting
    // Uses 'openai-tier-1' by default (1M TPM, 500 RPM)
    // Most accounts start at Tier 1 - can be upgraded via kb.config.json
    const embeddingStage = new EmbeddingStage(
      embeddingProvider,
      chunks as any[],
      {
        maxRetries: 3,
        maxConcurrency: 3, // Limited concurrency, rate limiter ensures we stay within TPM limits
        rateLimits: 'openai-tier-1', // OpenAI Tier 1 limits (conservative default)
      }
    );
    pipeline.addStage(embeddingStage);

    // Execute embedding
    await embeddingStage.execute(context);
    const chunksWithEmbeddings = embeddingStage.getChunksWithEmbeddings();

    // Create storage stage with optimized batch processing
    // Check if deduplication should be skipped (via environment variable for now)
    const skipDedup = process.env.KB_SKIP_DEDUPLICATION === 'true' || (options as any).skipDeduplication === true;
    const storageStage = new StorageStage(
      vectorStoreAdapter,
      chunksWithEmbeddings as any[],
      { batchSize: 100, deduplication: !skipDedup, updateExisting: true } // Optimized batch size (was 50)
    );
    pipeline.addStage(storageStage);

    // Execute storage
    const storageResult = await storageStage.execute(context);
    const storageData = (storageResult.data ?? {}) as Record<string, unknown>;
    const chunksUpdated = Number(storageData.chunksUpdated ?? 0);
    const chunksSkipped = Number(storageData.chunksSkipped ?? 0);
    const staleChunksDeleted = Number(storageData.staleChunksDeleted ?? 0);
    const staleFilesDeleted = Number(storageData.staleFilesDeleted ?? 0);
    const invalidChunks = Number(storageData.chunksInvalid ?? 0);
    deletedChunks += staleChunksDeleted;
    deletedFiles += staleFilesDeleted;

    // Log final stats (debug level - UI will show summary)
    this.runtime.log?.('debug', `Indexing complete`, {
      scopeId: options.scope.id,
      filesDiscovered: context.stats.filesDiscovered,
      filesProcessed: context.stats.filesProcessed,
      filesSkipped: context.stats.filesSkipped,
      totalChunks: context.stats.totalChunks,
      chunksUpdated,
      chunksSkipped,
      deletedFiles,
      deletedChunks,
      invalidChunks,
      errors: context.stats.errors.length,
      duration: `${((Date.now() - context.stats.startTime) / 1000).toFixed(2)}s`,
    });

    // Return indexing statistics
    return {
      filesDiscovered: context.stats.filesDiscovered,
      filesProcessed: context.stats.filesProcessed,
      filesSkipped: context.stats.filesSkipped,
      chunksStored: context.chunksStored ?? 0,
      chunksUpdated,
      chunksSkipped,
      errorCount: context.stats.errors.length,
      durationMs: Date.now() - context.stats.startTime,
      deletedFiles,
      deletedChunks,
      invalidChunks,
    } as IndexingStats;
  }

  async query(
    query: KnowledgeQuery,
    context: KnowledgeExecutionContext,
  ): Promise<KnowledgeResult> {
    // Check if reasoning is enabled and should be used
    if (this.options.search.reasoning.enabled && this.reasoningEngine) {
      try {
        this.reportProgress('using_reasoning_engine');
        // Use reasoning engine for complex queries
        const reasoningResult = await this.reasoningEngine.execute(
          query,
          context,
          // Executor function that calls this.query recursively (but without reasoning to avoid infinite loop)
          async (q: KnowledgeQuery, ctx: KnowledgeExecutionContext) => {
            // Temporarily disable reasoning to avoid recursion
            const originalReasoningEnabled = this.options.search.reasoning.enabled;
            this.options.search.reasoning.enabled = false;
            try {
              return this.executeQuery(q, ctx);
            } finally {
              this.options.search.reasoning.enabled = originalReasoningEnabled;
            }
          },
        );
        
        // ReasoningResult extends KnowledgeResult, so all properties are available
        const result = reasoningResult as unknown as KnowledgeResult;

        this.reportProgress('reasoning_completed', `${result.chunks.length} chunks`, {
          chunks: result.chunks.length,
          subqueries: result.metadata?.subqueries,
        });

        // Return the result directly - it already has all required KnowledgeResult fields
        return {
          ...result,
          engineId: this.id,
        };
      } catch (error) {
        // Fallback to regular query if reasoning fails
        this.runtime.log?.('warn', 'Reasoning failed, falling back to regular query', {
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue to regular query execution
      }
    }

    // Regular query execution (or fallback from reasoning)
    return this.executeQuery(query, context);
  }

  /**
   * Internal query execution method (without reasoning)
   */
  private async executeQuery(
    query: KnowledgeQuery,
    context: KnowledgeExecutionContext,
  ): Promise<KnowledgeResult> {
    this.reportProgress('generating_embedding');
    const [queryVector] = await this.embeddingProvider.embed([query.text]);
    if (!queryVector) {
      throw createKnowledgeError(
        'KNOWLEDGE_QUERY_INVALID',
        'Unable to generate embedding for query text.',
      );
    }

    const filters = this.createSearchFilters(context);
    const sourcesDigest = this.computeSourcesDigest(context.sources);
    const limit = context.limit ?? query.limit ?? 20;
    let matches: VectorSearchMatch[];
    let queryClassification: {
      type: string;
      retrievalProfile: 'exact_lookup' | 'semantic_explore';
      recallStrategy: 'default' | 'broad_recall';
      confidence: number;
      usedWeights: { vector: number; keyword: number };
      identifiers: string[];
    } | null = null;

    // Get search weights - priority: query.metadata > adaptive learning > config defaults
    let vectorWeight = this.options.search.vectorWeight;
    let keywordWeight = this.options.search.keywordWeight;
    let rrfK = this.options.search.rrfK;

    // First, check if weights provided explicitly in query metadata (from orchestrator)
    const metadataWeights = query.metadata as { vectorWeight?: number; keywordWeight?: number } | undefined;
    if (metadataWeights?.vectorWeight !== undefined && metadataWeights?.keywordWeight !== undefined) {
      vectorWeight = metadataWeights.vectorWeight;
      keywordWeight = metadataWeights.keywordWeight;
      this.runtime.log?.('debug', 'Using query-specified weights', {
        vectorWeight,
        keywordWeight,
        source: 'query.metadata',
      });
    } else if (this.options.learning.enabled && this.adaptiveWeights) {
      // Fallback to adaptive learning if enabled
      try {
        const adaptiveWeights = await this.adaptiveWeights.getWeights(
          query.text,
          queryVector.values,
          context.scope.id,
        );
        vectorWeight = adaptiveWeights.vectorWeight;
        keywordWeight = adaptiveWeights.keywordWeight;
        rrfK = adaptiveWeights.rrfK;
        this.runtime.log?.('debug', 'Using adaptive weights', {
          vectorWeight,
          keywordWeight,
          rrfK,
        });
      } catch (error) {
        this.runtime.log?.('warn', 'Failed to get adaptive weights, using defaults', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Use hybrid search if enabled
    if (this.options.search.hybrid && this.vectorStore.getAllChunks) {
      this.reportProgress('performing_hybrid_search');
      // Get all chunks for keyword search
      const allChunks = await this.vectorStore.getAllChunks(context.scope.id, filters);

      const forceWeights =
        metadataWeights?.vectorWeight !== undefined && metadataWeights?.keywordWeight !== undefined
          ? { vector: vectorWeight, keyword: keywordWeight }
          : undefined;

      // Perform adaptive hybrid search (lookup/concept aware + exact identifier boost)
      const adaptiveResult = await adaptiveHybridSearch(
        async (scopeId, vector, limit, searchFilters) => {
          return this.vectorStore.search(scopeId, vector, limit, searchFilters);
        },
        context.scope.id,
        queryVector,
        query.text,
        allChunks,
        limit,
        filters,
        {
          rrfK,
          forceWeights,
          adaptiveWeights: forceWeights ? false : true,
          sourceBoost: true,
          classifier: {
            enabled: true,
            llm: this.llm,
          },
        },
      );
      matches = adaptiveResult.matches;
      queryClassification = {
        type: adaptiveResult.classification.type,
        retrievalProfile: adaptiveResult.classification.retrievalProfile,
        recallStrategy: adaptiveResult.classification.recallStrategy,
        confidence: adaptiveResult.classification.confidence,
        usedWeights: adaptiveResult.usedWeights,
        identifiers: adaptiveResult.identifiers,
      };
      this.runtime.log?.('debug', 'Adaptive hybrid classification', {
        queryType: adaptiveResult.classification.type,
        confidence: adaptiveResult.classification.confidence,
        usedWeights: adaptiveResult.usedWeights,
        identifiers: adaptiveResult.identifiers,
      });
    } else {
      // Vector search only
      this.reportProgress('searching_vector_store');
      matches = await this.vectorStore.search(
      context.scope.id,
      queryVector,
      limit,
      filters,
    );
    }
    
    this.reportProgress('search_completed', `${matches.length} matches`, { matches: matches.length });

    // Apply popularity boost if enabled
    if (this.options.learning.enabled && this.popularityBoost) {
      this.reportProgress('applying_popularity_boost');
      matches = await Promise.all(
        matches.map(async (match) => {
          const chunkId = match.chunk.chunkId ?? `${match.chunk.path}:${match.chunk.span.startLine}-${match.chunk.span.endLine}`;
          const boost = await this.popularityBoost!.getBoost(chunkId, context.scope.id);
          return {
            ...match,
            score: match.score * boost,
          };
        }),
      );
      // Re-sort after boost
      matches.sort((a, b) => b.score - a.score);
    }

    // Apply query pattern boost if enabled
    if (this.options.learning.enabled && this.queryPatternMatcher) {
      try {
        this.reportProgress('applying_query_pattern_boost');
        const recommendedChunkIds = await this.queryPatternMatcher.getRecommendedChunks(
          query.text,
          queryVector.values,
          context.scope.id,
          10,
        );
        if (recommendedChunkIds.length > 0) {
          matches = applyPatternBoost(matches, recommendedChunkIds, 1.3);
          matches.sort((a, b) => b.score - a.score);
        }
      } catch (error) {
        this.runtime.log?.('warn', 'Failed to apply query pattern boost', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Apply re-ranking if enabled
    let finalMatches = matches;
    if (this.reranker) {
      this.reportProgress('re_ranking_results');
      finalMatches = await this.reranker.rerank(query.text, matches, {
        topK: this.options.search.reranking.topK,
        minScore: this.options.search.reranking.minScore,
      });
      this.reportProgress('re_ranking_completed', `${finalMatches.length} reranked`, { reranked: finalMatches.length });
    }

    const requestedMode = (query.metadata as { mode?: unknown } | undefined)?.mode
      ?? context.profile?.id;
    const retrievalMode = resolveRetrievalMode(requestedMode);
    const freshnessResult = applyFreshnessRanking(
      finalMatches,
      this.options.search.freshness,
      retrievalMode,
    );
    finalMatches = freshnessResult.matches;
    const conflictsResult = applyConflictResolution(
      finalMatches,
      this.options.search.conflicts,
      retrievalMode,
    );
    finalMatches = conflictsResult.matches;
    const queryMetadata = (query.metadata as Record<string, unknown> | undefined) ?? undefined;
    const reliabilityDecision = evaluateReliability(
      {
        stalenessLevel: freshnessResult.diagnostics.stalenessLevel,
        retrievalMode,
        scores: finalMatches.map((match) => match.score),
        queryMetadata,
      },
      this.options.search.reliability,
    );
    const confidenceAdjustments = buildConfidenceAdjustments({
      stalenessLevel: freshnessResult.diagnostics.stalenessLevel,
      penalizedConflicts: conflictsResult.diagnostics.penalizedChunks,
      confidenceFloor: this.options.search.reliability.confidenceFloor,
      decision: reliabilityDecision,
    });

    // Convert to chunks
    let chunks: KnowledgeChunk[] = finalMatches.map((match: VectorSearchMatch) => ({
      id: match.chunk.chunkId ?? `${match.chunk.path}:${match.chunk.span.startLine}-${match.chunk.span.endLine}`,
      sourceId: match.chunk.sourceId ?? 'unknown',
      path: match.chunk.path,
      span: match.chunk.span,
      text: match.chunk.text,
      score: match.score,
      metadata: match.chunk.metadata,
    }));

    // Apply context optimization if enabled
    if (this.options.search.optimization.enabled) {
      chunks = this.contextOptimizer.optimize(finalMatches, {
        maxChunks: limit,
        deduplication: this.options.search.optimization.deduplication,
        deduplicationThreshold: this.options.search.optimization.deduplicationThreshold,
        diversification: this.options.search.optimization.diversification,
        diversityThreshold: this.options.search.optimization.diversityThreshold,
        maxChunksPerFile: this.options.search.optimization.maxChunksPerFile,
        adaptiveSelection: this.options.search.optimization.adaptiveSelection,
        tokenBudget: (context as any).tokenBudget,
        avgTokensPerChunk: this.options.search.optimization.avgTokensPerChunk,
      });
    }

    if (reliabilityDecision.failClosed) {
      return {
        query: { ...query, intent: query.intent ?? 'search', limit },
        chunks: [],
        contextText: '',
        engineId: this.id,
        generatedAt: new Date().toISOString(),
        metadata: {
          queryClassification,
          retrievalProfile: freshnessResult.diagnostics.retrievalProfile,
          freshnessApplied: freshnessResult.diagnostics.applied,
          boostedCandidates: freshnessResult.diagnostics.boostedCandidates,
          stalenessLevel: freshnessResult.diagnostics.stalenessLevel,
          conflictsDetected: conflictsResult.diagnostics.conflictsDetected,
          conflictTopics: conflictsResult.diagnostics.conflictTopics,
          conflictPolicy: conflictsResult.diagnostics.policy,
          confidence: reliabilityDecision.confidence,
          complete: false,
          recoverable: true,
          failClosed: true,
          recoverableHints: reliabilityDecision.recoverableHints,
          confidenceAdjustments,
          indexRevision: (finalMatches[0]?.chunk.metadata?.indexRevision as string | undefined) ?? null,
          engineConfigHash: this.engineConfigHash,
          sourcesDigest,
        },
      };
    }

    // In-memory cache for compressed chunks (per query)
    const compressionCache = new Map<string, string>();
    
    // Calculate tokens before compression
    const tokensBeforeCompression = chunks.reduce((sum, chunk) => {
      return sum + Math.ceil(chunk.text.length / 4);
    }, 0);
    
    let metadataOnlyCount = 0;
    
    // Format chunks with compression
    const compressionOptions = this.options.search.optimization.compression;
    const formattedChunks = await Promise.all(
      chunks.map(async (chunk) => {
        // Check cache first (if cache is enabled and using memory)
        if (compressionOptions.enabled && compressionOptions.cache === 'memory') {
          const chunkId = chunk.id ?? `${chunk.path}:${chunk.span.startLine}-${chunk.span.endLine}`;
          const cached = compressionCache.get(chunkId);
          if (cached) {
            return cached;
          }
        }
        
        // Count metadata-only chunks
        if (
          compressionOptions.enabled &&
          compressionOptions.metadataOnly.enabled &&
          chunk.score !== undefined &&
          chunk.score < compressionOptions.metadataOnly.scoreThreshold
        ) {
          metadataOnlyCount++;
        }
        
        // Format chunk with compression
        const formatted = await this.formatChunkForContext(
          chunk,
          query.text,
          compressionOptions.enabled ? compressionOptions : undefined,
          chunk.score,
        );
        
        // Cache the result
        if (compressionOptions.enabled && compressionOptions.cache === 'memory') {
          const chunkId = chunk.id ?? `${chunk.path}:${chunk.span.startLine}-${chunk.span.endLine}`;
          compressionCache.set(chunkId, formatted);
        }
        
        return formatted;
      }),
    );
    
    const contextText = formattedChunks.join('\n\n---\n\n');
    
    // Calculate tokens after compression
    const tokensAfterCompression = Math.ceil(contextText.length / 4);
    const tokensSaved = tokensBeforeCompression - tokensAfterCompression;
    const compressionRate = tokensBeforeCompression > 0
      ? ((tokensSaved / tokensBeforeCompression) * 100).toFixed(1)
      : '0.0';
    
    // Log compression metrics if compression is enabled
    if (compressionOptions.enabled) {
      this.reportProgress('compression_applied', `${compressionRate}% saved`, {
        totalChunks: chunks.length,
        metadataOnlyChunks: metadataOnlyCount,
        tokensBeforeCompression,
        tokensAfterCompression,
        tokensSaved,
        compressionRate: `${compressionRate}%`,
      });
    }

    // Save query history if enabled (async, don't wait)
    if (this.options.learning.enabled && this.queryHistory) {
      this.reportProgress('saving_query_history');
      const queryId = createHash('sha256')
        .update(`${context.scope.id}:${query.text}:${Date.now()}`)
        .digest('hex')
        .substring(0, 16);
      
      const queryHash = createHash('sha256')
        .update(query.text.toLowerCase().trim())
        .digest('hex');

      const historyEntry: QueryHistoryEntry = {
        queryId,
        queryText: query.text,
        queryHash,
        scopeId: context.scope.id,
        timestamp: Date.now(),
        resultChunkIds: chunks.map(c => c.id ?? `${c.path}:${c.span.startLine}-${c.span.endLine}`),
        topChunkIds: chunks.slice(0, 10).map(c => c.id ?? `${c.path}:${c.span.startLine}-${c.span.endLine}`),
        queryVector: queryVector.values,
      };

      this.runtime.log?.('debug', 'Saving query history', {
        queryId,
        queryText: query.text.substring(0, 50),
        chunksCount: chunks.length,
        hasQueryHistory: !!this.queryHistory,
        queryVectorLength: queryVector.values.length,
      });

      // Save query history
      // For testing: await to see errors immediately (remove await in production)
      try {
        await this.queryHistory.save(historyEntry);
        this.runtime.log?.('debug', 'Query history saved successfully', {
          queryId,
          queryText: query.text.substring(0, 30),
        });
      } catch (error) {
        this.runtime.log?.('error', 'Failed to save query history', {
          error: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          queryId,
          queryText: query.text.substring(0, 30),
        });
        // Don't throw - learning is non-critical
      }
    }

    // Generate self-feedback for top chunks (async, don't wait)
    if (this.options.learning.enabled && this.selfFeedbackGenerator && this.feedbackStore) {
      const topChunks = chunks.slice(0, 5); // Top 5 chunks
      const queryId = createHash('sha256')
        .update(`${context.scope.id}:${query.text}:${Date.now()}`)
        .digest('hex')
        .substring(0, 16);

      Promise.all(
        topChunks.map(async (chunk) => {
          try {
            const feedback = await this.selfFeedbackGenerator!.generateFeedback(
              query.text,
              chunk.text,
              chunk.path,
            );

            const feedbackEntry: FeedbackEntry = {
              feedbackId: createHash('sha256')
                .update(`${queryId}:${chunk.id}:${Date.now()}`)
                .digest('hex')
                .substring(0, 16),
              queryId,
              chunkId: chunk.id ?? `${chunk.path}:${chunk.span.startLine}-${chunk.span.endLine}`,
              scopeId: context.scope.id,
              type: 'self',
              score: feedback.score,
              timestamp: Date.now(),
              metadata: {
                llmReasoning: feedback.reasoning,
                confidence: feedback.confidence,
              },
            };

            await this.feedbackStore!.save(feedbackEntry);
          } catch (error) {
            this.runtime.log?.('warn', 'Failed to generate self-feedback', {
              chunkId: chunk.id ?? `${chunk.path}:${chunk.span.startLine}-${chunk.span.endLine}`,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }),
      ).catch((error) => {
        this.runtime.log?.('warn', 'Error in self-feedback generation', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    return {
      query: { ...query, intent: query.intent ?? 'search', limit },
      chunks,
      contextText,
      engineId: this.id,
      generatedAt: new Date().toISOString(),
      // Add learning metadata for agent to use
      metadata: {
        ...(this.options.learning.enabled ? {
          _learning: {
            queryId: createHash('sha256')
              .update(`${context.scope.id}:${query.text}:${Date.now()}`)
              .digest('hex')
              .substring(0, 16),
            feedbackStore: this.feedbackStore ? {
              // Method for agent to provide implicit feedback
              recordUsage: async (chunkIds: string[], usedInResponse: boolean = true) => {
            if (!this.feedbackStore) {return;}
            
            const queryId = createHash('sha256')
              .update(`${context.scope.id}:${query.text}:${Date.now()}`)
              .digest('hex')
              .substring(0, 16);

            await Promise.all(
              chunkIds.map(async (chunkId) => {
                const chunk = chunks.find(c => c.id === chunkId);
                if (!chunk) {return;}

                const feedbackEntry: FeedbackEntry = {
                  feedbackId: createHash('sha256')
                    .update(`${queryId}:${chunkId}:${Date.now()}`)
                    .digest('hex')
                    .substring(0, 16),
                  queryId,
                  chunkId,
                  scopeId: context.scope.id,
                  type: 'implicit',
                  score: usedInResponse ? 0.8 : 0.2, // High score if used, low if not
                  timestamp: Date.now(),
                  metadata: {
                    usedInResponse,
                    positionInResults: chunks.findIndex(c => c.id === chunkId),
                  },
                };

                if (this.feedbackStore) {
                  await this.feedbackStore.save(feedbackEntry);
                }
              }),
            );
              },
            } : undefined,
          },
        } : {}),
        queryClassification,
        retrievalProfile: freshnessResult.diagnostics.retrievalProfile,
        freshnessApplied: freshnessResult.diagnostics.applied,
        boostedCandidates: freshnessResult.diagnostics.boostedCandidates,
        stalenessLevel: freshnessResult.diagnostics.stalenessLevel,
        conflictsDetected: conflictsResult.diagnostics.conflictsDetected,
        conflictTopics: conflictsResult.diagnostics.conflictTopics,
        conflictPolicy: conflictsResult.diagnostics.policy,
        confidence: reliabilityDecision.confidence,
        complete: !reliabilityDecision.belowConfidenceFloor,
        recoverable: reliabilityDecision.belowConfidenceFloor,
        failClosed: false,
        recoverableHints: reliabilityDecision.recoverableHints,
        confidenceAdjustments,
        indexRevision: (chunks[0]?.metadata?.indexRevision as string | undefined) ?? null,
        engineConfigHash: this.engineConfigHash,
        sourcesDigest,
      },
    };
  }

  /**
   * Format chunk for context with compression support
   */
  private async formatChunkForContext(
    chunk: KnowledgeChunk,
    query: string,
    compressionOptions?: NormalizedOptions['search']['optimization']['compression'],
    score?: number,
  ): Promise<string> {
    const parts: string[] = [];
    
    // File path and location
    parts.push(`File: ${chunk.path}`);
    parts.push(`Lines: ${chunk.span.startLine}-${chunk.span.endLine}`);
    
    // Add function/class context if available in metadata
    if (chunk.metadata) {
      const functionName = chunk.metadata.functionName as string | undefined;
      const className = chunk.metadata.className as string | undefined;
      const typeName = chunk.metadata.typeName as string | undefined;
      
      if (className) {
        parts.push(`Class: ${className}`);
      }
      if (functionName) {
        parts.push(`Function: ${functionName}`);
      }
      if (typeName) {
        parts.push(`Type: ${typeName}`);
      }
      
      // Add heading context for markdown
      const headingTitle = chunk.metadata.headingTitle as string | undefined;
      const headingLevel = chunk.metadata.headingLevel as number | undefined;
      if (headingTitle) {
        const headingPrefix = headingLevel ? '#'.repeat(headingLevel) + ' ' : '';
        parts.push(`Section: ${headingPrefix}${headingTitle}`);
      }
    }
    
    // Add chunk type if available
    const chunkType = chunk.metadata?.chunkType as string | undefined;
    if (chunkType) {
      parts.push(`Type: ${chunkType}`);
    }
    
    parts.push(''); // Empty line before content
    
    // Apply compression if enabled
    let chunkText = chunk.text;
    
    if (compressionOptions?.enabled) {
      // Metadata-only mode for low-score chunks
      if (
        compressionOptions.metadataOnly.enabled &&
        score !== undefined &&
        score < compressionOptions.metadataOnly.scoreThreshold
      ) {
        return formatMetadataOnly(chunk);
      }
      
      // LLM compression (if enabled and available)
      if (
        compressionOptions.llm.enabled &&
        this.llmCompressor &&
        chunkText.length > 500 // Only compress longer chunks
      ) {
        try {
          chunkText = await this.llmCompressor.compress(chunk, query);
          this.runtime.log?.('debug', 'LLM compression applied', {
            chunkId: chunk.id ?? `${chunk.path}:${chunk.span.startLine}-${chunk.span.endLine}`,
            originalLength: chunk.text.length,
            compressedLength: chunkText.length,
            compressionRatio: ((chunkText.length / chunk.text.length) * 100).toFixed(1) + '%',
          });
        } catch (error) {
          this.runtime.log?.('warn', 'LLM compression failed, using original', {
            chunkId: chunk.id ?? `${chunk.path}:${chunk.span.startLine}-${chunk.span.endLine}`,
            error: error instanceof Error ? error.message : String(error),
          });
          // Fall through to smart truncation
        }
      }
      
      // Smart truncation (fallback or additional compression)
      if (compressionOptions.smartTruncation.enabled) {
        chunkText = smartTruncate(
          chunkText,
          compressionOptions.smartTruncation.maxLength,
          compressionOptions.smartTruncation.preserveStructure,
        );
      }
    }
    
    parts.push(chunkText);
    
    return parts.join('\n');
  }

  private async collectChunks(
    sources: KnowledgeSource[],
  ): Promise<{ chunks: MindChunk[]; fileMetadata: Map<string, import('./vector-store/vector-store').FileMetadata> }> {
    const chunkList: MindChunk[] = [];
    const fileMetadata = new Map<string, import('./vector-store/vector-store').FileMetadata>();
    
    for (const source of sources) {
      const files = await fg(source.paths, {
        cwd: this.workspaceRoot,
        ignore: source.exclude ?? [],
        onlyFiles: true,
        dot: true,
        absolute: false,
      });

      this.runtime.log?.('debug', `Found ${files.length} files for source ${source.id}`, {
        sourceId: source.id,
        paths: source.paths,
        filesCount: files.length,
      });

      for (const relativePath of files) {
        const fullPath = path.resolve(this.workspaceRoot, relativePath);
        const normalizedPath = relativePath.replace(/\\/g, '/');

        // Get file stats for incremental updates
        const stats = await fs.stat(fullPath);

        // CRITICAL OOM FIX: Check file size BEFORE reading to prevent OOM
        const fileSizeMB = stats.size / (1024 * 1024);
        const MAX_FILE_SIZE_MB = 10;

        if (fileSizeMB > MAX_FILE_SIZE_MB) {
          this.runtime.log?.('warn', `Skipping large file: ${normalizedPath} (${fileSizeMB.toFixed(2)} MB > ${MAX_FILE_SIZE_MB} MB)`);
          continue; // Skip huge files that would cause OOM
        }

        const contents = await fs.readFile(fullPath, 'utf8');
        const hash = createHash('sha256').update(contents).digest('hex');
        
        // Store file metadata
        fileMetadata.set(normalizedPath, {
          path: normalizedPath,
          mtime: stats.mtimeMs,
          hash,
        });
        
        const sourceChunks = this.chunkFile(
          source,
          normalizedPath,
          contents,
        );
        chunkList.push(...sourceChunks);
      }
    }
    
    this.runtime.log?.('debug', `Total chunks collected: ${chunkList.length}`, {
      sourcesCount: sources.length,
      totalChunks: chunkList.length,
      filesCount: fileMetadata.size,
    });
    
    return { chunks: chunkList, fileMetadata };
  }

  private chunkFile(
    source: KnowledgeSource,
    relativePath: string,
    contents: string,
  ): MindChunk[] {
    // Get appropriate chunker for this file
    const chunker = getChunkerForFile(relativePath, source.language);

    // Prepare chunking options based on source kind
    const chunkingOptions = {
      maxLines:
        source.kind === 'docs'
          ? this.options.chunk.docLines
          : this.options.chunk.codeLines,
      minLines: source.kind === 'docs' ? 30 : 20,
      overlap: this.options.chunk.overlap,
      preserveContext: true,
      // Language-specific options
      ...(source.kind === 'code' && {
        includeJSDoc: true,
      }),
      ...(source.kind === 'docs' && {
        byHeadings: true,
        includeCodeBlocks: true,
      }),
    };

    // Chunk using selected chunker
    const chunks = chunker.chunk(contents, relativePath, chunkingOptions);

    // Convert to MindChunk format
    return chunks.map((chunk: Chunk, idx: number) => ({
      chunkId: `${source.id}:${relativePath}:${chunk.span.startLine}-${chunk.span.endLine}:${idx}`,
      sourceId: source.id,
      path: relativePath,
      span: chunk.span,
      text: chunk.text,
      metadata: {
        kind: source.kind,
        language: source.language,
        chunkerId: chunker.id,
        chunkType: chunk.type,
        chunkName: chunk.name,
        ...chunk.metadata,
      },
    }));
  }

  private chunkFileByLines(
    source: KnowledgeSource,
    relativePath: string,
    contents: string,
  ): MindChunk[] {
    // CRITICAL OOM FIX: Check file size before split() to prevent memory issues
    // V8's split() on huge strings creates massive arrays causing OOM
    const MAX_CONTENT_LENGTH = 10000000; // 10MB max
    if (contents.length > MAX_CONTENT_LENGTH) {
      logger.warn('File is too large, truncating', {
        file: relativePath,
        size: contents.length,
        maxSize: MAX_CONTENT_LENGTH,
      });
      contents = contents.substring(0, MAX_CONTENT_LENGTH);
    }

    const lines = contents.split(/\r?\n/);
    const maxLines =
      source.kind === 'docs'
        ? this.options.chunk.docLines
        : this.options.chunk.codeLines;
    const overlap = this.options.chunk.overlap;

    const chunks: MindChunk[] = [];
    let start = 0;
    while (start < lines.length) {
      const end = Math.min(lines.length, start + maxLines);
      const text = lines.slice(start, end).join('\n');
      const span: SpanRange = {
        startLine: start + 1,
        endLine: end,
      };
      chunks.push({
        chunkId: `${source.id}:${relativePath}:${span.startLine}-${span.endLine}`,
        sourceId: source.id,
        path: relativePath,
        span,
        text,
        metadata: {
          kind: source.kind,
          language: source.language,
          chunkMethod: 'line-based',
        },
      });

      if (end === lines.length) {
        break;
      }
      start = Math.max(0, end - overlap);
    }
    return chunks;
  }

  private async embedChunks(chunks: MindChunk[]) {
    const texts = chunks.map(chunk => chunk.text);

    // Track analytics
    const startTime = Date.now();
    this.runtime.analytics?.track('rag.embed_chunks.start', {
      chunksCount: chunks.length,
      provider: this.embeddingProvider.id,
    });

    try {
      const embeddings = await this.embeddingProvider.embed(texts);
      
      const duration = Date.now() - startTime;
      this.runtime.analytics?.track('rag.embed_chunks.complete', {
        chunksCount: chunks.length,
        provider: this.embeddingProvider.id,
        duration,
      });

      return embeddings;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.runtime.analytics?.track('rag.embed_chunks.error', {
        chunksCount: chunks.length,
        provider: this.embeddingProvider.id,
        error: error instanceof Error ? error.message : String(error),
        duration,
      });
      throw error;
    }
  }

  private createSearchFilters(
    context: KnowledgeExecutionContext,
  ): VectorSearchFilters | undefined {
    if (!context.filters) {
      return undefined;
    }
    const filters: VectorSearchFilters = {};
    if (context.filters.sourceIds?.length) {
      filters.sourceIds = new Set(context.filters.sourceIds);
    }
    if (context.filters.paths?.length) {
      const matcher = picomatch(context.filters.paths, { dot: true });
      filters.pathMatcher = (candidate: string) => matcher(candidate);
    }
    return Object.keys(filters).length ? filters : undefined;
  }

  private computeSourcesDigest(sources: KnowledgeSource[]): string {
    const normalized = sources.map((source) => ({
      id: source.id,
      kind: source.kind,
      paths: source.paths,
      exclude: source.exclude,
      language: source.language,
    }));
    return hashConfigForDeterminism(normalized);
  }

  private isPartialIndexMode(
    sources: KnowledgeSource[],
    workspaceRoot: string,
  ): boolean {
    for (const source of sources) {
      for (const candidatePath of source.paths ?? []) {
        if (this.isLikelySingleFileTarget(candidatePath, workspaceRoot)) {
          return true;
        }
      }
    }
    return false;
  }

  private isLikelySingleFileTarget(candidatePath: string, workspaceRoot: string): boolean {
    if (this.hasGlobSyntax(candidatePath)) {
      return false;
    }
    const absolutePath = path.resolve(workspaceRoot, candidatePath);
    try {
      return fs.statSync(absolutePath).isFile();
    } catch {
      // Fail-closed for safety: when path doesn't resolve (or can't be read),
      // treat as partial target to avoid accidental stale mass-deletions.
      return true;
    }
  }

  private hasGlobSyntax(value: string): boolean {
    return /[*?[\]{}()!]/.test(value);
  }
}

function normalizeOptions(raw: MindEngineOptions): NormalizedOptions {
  const rerankingType = raw.search?.reranking?.type ?? 'none';
  const rerankingEnabled = rerankingType !== 'none';
  const optimizationEnabled = raw.search?.optimization !== undefined;
  const learningStorageOptions = (raw.learning as any)?.storageOptions;

  return {
    indexDir: raw.indexDir ?? DEFAULT_INDEX_DIR,
    chunk: {
      codeLines: raw.chunk?.codeLines ?? DEFAULT_CODE_CHUNK_LINES,
      docLines: raw.chunk?.docLines ?? DEFAULT_DOC_CHUNK_LINES,
      overlap: raw.chunk?.overlap ?? DEFAULT_CHUNK_OVERLAP,
    },
    search: {
      hybrid: raw.search?.hybrid ?? false,
      vectorWeight: raw.search?.vectorWeight ?? 0.7,
      keywordWeight: raw.search?.keywordWeight ?? 0.3,
      rrfK: raw.search?.rrfK ?? 60,
      freshness: {
        enabled: raw.search?.freshness?.enabled ?? true,
        docsWeight: raw.search?.freshness?.docsWeight ?? 0.25,
        codeWeight: raw.search?.freshness?.codeWeight ?? 0.1,
        trustWeight: raw.search?.freshness?.trustWeight ?? 0.1,
        maxBoost: raw.search?.freshness?.maxBoost ?? 0.3,
        staleThresholdHours: {
          soft: raw.search?.freshness?.staleThresholdHours?.soft ?? 72,
          hard: raw.search?.freshness?.staleThresholdHours?.hard ?? 168,
        },
      },
      conflicts: {
        enabled: raw.search?.conflicts?.enabled ?? true,
        policy: 'freshness-first',
        maxLosersPerTopic: raw.search?.conflicts?.maxLosersPerTopic ?? 3,
        penalty: raw.search?.conflicts?.penalty ?? 0.2,
      },
      reliability: {
        hardStaleFailClosed: raw.search?.reliability?.hardStaleFailClosed ?? true,
        confidenceFloor: raw.search?.reliability?.confidenceFloor ?? 0.75,
        thinkingModeStrict: raw.search?.reliability?.thinkingModeStrict ?? true,
      },
      reranking: {
        enabled: rerankingEnabled,
        type: rerankingType,
        topK: raw.search?.reranking?.topK ?? 20,
        minScore: raw.search?.reranking?.minScore ?? 0,
        config: rerankingEnabled
          ? {
              type: rerankingType,
              crossEncoder: raw.search?.reranking?.crossEncoder,
            }
          : undefined,
      },
      optimization: {
        enabled: optimizationEnabled,
        deduplication: raw.search?.optimization?.deduplication ?? true,
        deduplicationThreshold: raw.search?.optimization?.deduplicationThreshold ?? 0.9,
        diversification: raw.search?.optimization?.diversification ?? true,
        diversityThreshold: raw.search?.optimization?.diversityThreshold ?? 0.3,
        maxChunksPerFile: raw.search?.optimization?.maxChunksPerFile ?? 3,
        adaptiveSelection: raw.search?.optimization?.adaptiveSelection ?? false,
        avgTokensPerChunk: raw.search?.optimization?.avgTokensPerChunk ?? 200,
        compression: {
          enabled: raw.search?.optimization?.compression?.enabled ?? false,
          cache: raw.search?.optimization?.compression?.cache ?? 'memory',
          smartTruncation: {
            enabled: raw.search?.optimization?.compression?.smartTruncation?.enabled ?? 
                     (raw.search?.optimization?.compression?.enabled ? true : false),
            maxLength: raw.search?.optimization?.compression?.smartTruncation?.maxLength ?? 2000,
            preserveStructure: raw.search?.optimization?.compression?.smartTruncation?.preserveStructure ?? true,
          },
          metadataOnly: {
            enabled: raw.search?.optimization?.compression?.metadataOnly?.enabled ?? 
                     (raw.search?.optimization?.compression?.enabled ? true : false),
            scoreThreshold: raw.search?.optimization?.compression?.metadataOnly?.scoreThreshold ?? 0.4,
          },
          llm: {
            enabled: raw.search?.optimization?.compression?.llm?.enabled ?? false,
            model: raw.search?.optimization?.compression?.llm?.model,
            maxTokens: raw.search?.optimization?.compression?.llm?.maxTokens,
          },
        },
      },
      reasoning: {
        enabled: raw.search?.reasoning?.enabled ?? false,
        complexityThreshold: raw.search?.reasoning?.complexityThreshold ?? 0.6,
        maxDepth: raw.search?.reasoning?.maxDepth ?? 3,
        complexityDetection: {
          heuristics: raw.search?.reasoning?.complexityDetection?.heuristics ?? true,
          llmBased: raw.search?.reasoning?.complexityDetection?.llmBased ?? false,
          llmModel: raw.search?.reasoning?.complexityDetection?.llmModel,
        },
        planning: {
          maxSubqueries: raw.search?.reasoning?.planning?.maxSubqueries ?? 5,
          model: raw.search?.reasoning?.planning?.model,
          temperature: raw.search?.reasoning?.planning?.temperature ?? 0.3,
          minSimilarity: raw.search?.reasoning?.planning?.minSimilarity ?? 0.85,
        },
        execution: {
          parallel: raw.search?.reasoning?.execution?.parallel ?? true,
          maxConcurrency: raw.search?.reasoning?.execution?.maxConcurrency ?? 3,
          timeoutMs: raw.search?.reasoning?.execution?.timeoutMs ?? 30000,
          earlyStopping: {
            enabled: raw.search?.reasoning?.execution?.earlyStopping?.enabled ?? true,
            minConfidence: raw.search?.reasoning?.execution?.earlyStopping?.minConfidence ?? 0.8,
            minChunksFound: raw.search?.reasoning?.execution?.earlyStopping?.minChunksFound ?? 5,
          },
        },
        synthesis: {
          enabled: raw.search?.reasoning?.synthesis?.enabled ?? true,
          deduplication: raw.search?.reasoning?.synthesis?.deduplication ?? true,
          maxTokens: raw.search?.reasoning?.synthesis?.maxTokens ?? 4000,
          model: raw.search?.reasoning?.synthesis?.model,
          temperature: raw.search?.reasoning?.synthesis?.temperature ?? 0.2,
          progressiveRefinement: raw.search?.reasoning?.synthesis?.progressiveRefinement ?? true,
        },
        safetyLimits: {
          maxTotalQueries: raw.search?.reasoning?.safetyLimits?.maxTotalQueries ?? 20,
          maxTokensPerDepth: raw.search?.reasoning?.safetyLimits?.maxTokensPerDepth ?? 10000,
          cyclicDetection: raw.search?.reasoning?.safetyLimits?.cyclicDetection ?? true,
        },
      },
    },
    learning: {
      enabled: raw.learning?.enabled ?? false,
      queryHistory: raw.learning?.queryHistory ?? (raw.learning?.enabled ? true : false),
      feedback: raw.learning?.feedback ?? (raw.learning?.enabled ? true : false),
      popularityBoost: raw.learning?.popularityBoost ?? (raw.learning?.enabled ? true : false),
      queryPatterns: raw.learning?.queryPatterns ?? (raw.learning?.enabled ? true : false),
      adaptiveWeights: raw.learning?.adaptiveWeights ?? false,
    storage: raw.learning?.storage === 'memory' ? 'memory' : 'platform',
      storageOptions: learningStorageOptions
        ? {
            history: {
              basePath: learningStorageOptions.history?.basePath,
              maxRecordsPerFile: learningStorageOptions.history?.maxRecordsPerFile,
              maxFiles: learningStorageOptions.history?.maxFiles,
            },
            feedback: {
              basePath: learningStorageOptions.feedback?.basePath,
              maxRecordsPerFile: learningStorageOptions.feedback?.maxRecordsPerFile,
              maxFiles: learningStorageOptions.feedback?.maxFiles,
            },
          }
        : undefined,
    },
  };
}

/**
 * Extract important parts of code (function signatures, type definitions, etc.)
 */
function extractImportantParts(text: string, maxLength: number): string[] {
  const lines = text.split('\n');
  const importantParts: string[] = [];
  const importantKeywords = ['export', 'function', 'class', 'interface', 'type', 'const', 'let', 'var', 'enum', 'namespace'];
  
  for (const line of lines) {
    const trimmed = line.trim();
    // Check if line contains important keywords
    if (importantKeywords.some(keyword => trimmed.startsWith(keyword) || trimmed.includes(` ${keyword} `))) {
      // Include the line if it's not too long
      if (trimmed.length <= maxLength * 0.3) {
        importantParts.push(line);
      }
    }
  }
  
  return importantParts;
}

/**
 * Smart truncation with context preservation
 */
function smartTruncate(
  text: string,
  maxLength: number,
  preserveStructure: boolean,
): string {
  if (text.length <= maxLength) {
    return text;
  }
  
  if (!preserveStructure) {
    // Simple truncation
    return text.slice(0, maxLength - 3) + '...';
  }
  
  // Preserve structure: beginning + important parts + end
  const lines = text.split('\n');
  const totalLines = lines.length;
  
  // Calculate how many lines we can keep
  const avgLineLength = text.length / totalLines;
  const maxLines = Math.floor(maxLength / avgLineLength);
  
  if (maxLines >= totalLines) {
    return text;
  }
  
  // Keep first 30% and last 30% of lines, plus important parts
  const keepStart = Math.floor(maxLines * 0.3);
  const keepEnd = Math.floor(maxLines * 0.3);
  const keepMiddle = maxLines - keepStart - keepEnd;
  
  const startLines = lines.slice(0, keepStart);
  const endLines = lines.slice(totalLines - keepEnd);
  
  // Extract important parts from the middle section
  const middleText = lines.slice(keepStart, totalLines - keepEnd).join('\n');
  const importantParts = extractImportantParts(middleText, maxLength);
  const importantLines = importantParts.slice(0, keepMiddle);
  
  const result = [
    ...startLines,
    ...(importantLines.length > 0 ? ['// ... important parts ...', ...importantLines] : []),
    '// ...',
    ...endLines,
  ].join('\n');
  
  // If still too long, truncate end
  if (result.length > maxLength) {
    return result.slice(0, maxLength - 3) + '...';
  }
  
  return result;
}

function sanitizeEngineOptionsForHash(options: MindEngineOptions): Record<string, unknown> {
  const {
    _runtime: _runtimeIgnored,
    onProgress: _onProgressIgnored,
    platform: _platformIgnored,
    ...rest
  } = options;
  return rest as Record<string, unknown>;
}

function hashConfigForDeterminism(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
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

/**
 * Format chunk as metadata-only (for low-score chunks)
 */
function formatMetadataOnly(chunk: KnowledgeChunk): string {
  const parts: string[] = [];
  parts.push(`[metadata-only] ${chunk.path}`);
  
  if (chunk.metadata) {
    const functionName = chunk.metadata.functionName as string | undefined;
    const className = chunk.metadata.className as string | undefined;
    const typeName = chunk.metadata.typeName as string | undefined;
    
    const nameParts: string[] = [];
    if (className) {nameParts.push(`class:${className}`);}
    if (functionName) {nameParts.push(`function:${functionName}`);}
    if (typeName) {nameParts.push(`type:${typeName}`);}
    
    if (nameParts.length > 0) {
      parts.push(`  ${nameParts.join(', ')}`);
    }
    
    // Try to extract a brief description from comments
    const text = chunk.text;
    const commentMatch = text.match(/\/\*\*[\s\S]*?\*\//) || text.match(/\/\/.*/);
    if (commentMatch) {
      const comment = commentMatch[0]
        .replace(/\/\*\*|\*\//g, '')
        .replace(/\*\s*/g, '')
        .trim()
        .split('\n')[0]
        ?.trim();
      if (comment && comment.length < 100) {
        parts.push(`  ${comment}`);
      }
    }
  }
  
  parts.push(`  Lines: ${chunk.span.startLine}-${chunk.span.endLine}`);
  
  return parts.join('\n');
}

export function createMindEngineFactory(): KnowledgeEngineFactory {
  return (config: KnowledgeEngineConfig, context: KnowledgeEngineFactoryContext) => 
    new MindEngine(config, context);
}

export interface RegisterMindEngineOptions {
  runtime?: RuntimeAdapter | {
    fetch?: typeof fetch;
    fs?: any;
    env?: (key: string) => string | undefined;
    log?: (
      level: 'debug' | 'info' | 'warn' | 'error',
      msg: string,
      meta?: Record<string, unknown>,
    ) => void;
    analytics?: {
      track(event: string, properties?: Record<string, unknown>): void;
      metric(name: string, value: number, tags?: Record<string, string>): void;
    };
  };
  platform?: MindPlatformBindings;
}

export function registerMindEngine(
  registry: KnowledgeEngineRegistry,
  options?: RegisterMindEngineOptions,
): void {
  // Create factory that captures runtime options
  const factory = (config: KnowledgeEngineConfig, context: KnowledgeEngineFactoryContext) => {
    // Inject runtime into config options if provided
    const configWithRuntime: KnowledgeEngineConfig = options?.runtime
      ? {
          ...config,
          options: {
            ...(config.options as MindEngineOptions | undefined),
            _runtime: options.runtime,
          },
        }
      : config;
    const configWithPlatform: KnowledgeEngineConfig = options?.platform
      ? {
          ...configWithRuntime,
          options: {
            ...(configWithRuntime.options as MindEngineOptions | undefined),
            platform: options.platform,
          },
        }
      : configWithRuntime;

    return new MindEngine(configWithPlatform, context);
  };

  registry.register('mind', factory);
}

// Export RuntimeAdapter for use in handlers
export type { RuntimeAdapter } from './adapters/runtime-adapter';
export { createRuntimeAdapter } from './adapters/runtime-adapter';

// Export compression types
export type { LLMCompressor } from './compression/llm-compressor';
export { NullLLMCompressor } from './compression/llm-compressor';
export { OpenAILLMCompressor } from './compression/openai-compressor';
export { ChunkSummarizer } from './compression/summarizer';

// Export compression options type
export type CompressionOptions = NormalizedOptions['search']['optimization']['compression'];

// Export sync API
export * from './sync/index';

// Export incremental indexing API
export * from './index/index';

// Export search API (query classification, adaptive search)
export * from './search/index';
