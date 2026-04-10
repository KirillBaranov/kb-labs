/**
 * Agent Query Orchestrator
 *
 * Main orchestrator that combines all components to produce
 * agent-optimized responses for RAG queries.
 */

import type {
  AgentResponse,
  AgentErrorResponse,
  AgentQueryMode,
  AgentMeta,
  AgentSourcesSummary,
} from './types';
import type { ILLM } from '@kb-labs/sdk';
import type { MindChunk } from '@kb-labs/mind-types';
import { AGENT_RESPONSE_SCHEMA_VERSION } from './types';

import { QueryDecomposer } from './decomposer/query-decomposer';
import { ChunkGatherer, type QueryFn } from './gatherer/chunk-gatherer';
import { CompletenessChecker } from './checker/completeness-checker';
import { ResponseSynthesizer } from './synthesizer/response-synthesizer';
import { ResponseCompressor } from './compressor/response-compressor';
import { QueryCache } from './cache/query-cache';
import { createMindAnalytics, type MindAnalytics, type MindAnalyticsContext } from './analytics/index';
import {
  type OrchestratorConfig,
  type OrchestratorQueryOptions,
  type OrchestratorResult,
  type RetrievalTelemetry,
  DEFAULT_ORCHESTRATOR_CONFIG,
} from './types';
import { classifyQuery } from '@kb-labs/mind-engine';

/**
 * Generate UUID using crypto
 */
function generateRequestId(): string {
  return 'rq-' + crypto.randomUUID().slice(0, 12);
}

export interface AgentQueryOrchestratorOptions {
  config?: Partial<OrchestratorConfig>;
  llm?: ILLM;
  broker?: any; // StateBroker-like interface (duck typing)
  analytics?: {
    enabled?: boolean;
    detailed?: boolean;
  };
  analyticsAdapter?: import('@kb-labs/sdk').IAnalytics | null;
}

/**
 * Agent Query Orchestrator
 *
 * Orchestrates the full query pipeline:
 * 1. Detect complexity / select mode
 * 2. Decompose query into sub-queries
 * 3. Gather chunks for each sub-query
 * 4. Check completeness (iterate if needed)
 * 5. Synthesize response
 * 6. Compress if needed
 */
export class AgentQueryOrchestrator {
  private readonly config: OrchestratorConfig;
  private readonly llm: ILLM | null;
  private readonly decomposer: QueryDecomposer | null;
  private readonly gatherer: ChunkGatherer;
  private readonly checker: CompletenessChecker | null;
  private readonly synthesizer: ResponseSynthesizer | null;
  private readonly compressor: ResponseCompressor;
  private readonly queryCache: QueryCache;
  private readonly analytics: MindAnalytics;

  constructor(options: AgentQueryOrchestratorOptions = {}) {
    this.config = {
      ...DEFAULT_ORCHESTRATOR_CONFIG,
      ...options.config,
      modes: {
        ...DEFAULT_ORCHESTRATOR_CONFIG.modes,
        ...options.config?.modes,
      },
      llm: {
        ...DEFAULT_ORCHESTRATOR_CONFIG.llm,
        ...options.config?.llm,
      },
      synthesis: {
        ...DEFAULT_ORCHESTRATOR_CONFIG.synthesis,
        ...options.config?.synthesis,
      },
      compression: {
        ...DEFAULT_ORCHESTRATOR_CONFIG.compression,
        ...options.config?.compression,
      },
      cache: {
        ...DEFAULT_ORCHESTRATOR_CONFIG.cache,
        ...options.config?.cache,
      },
    };

    this.llm = options.llm ?? null;

    // Create components that require LLM
    this.decomposer = this.llm
      ? new QueryDecomposer({ llm: this.llm, config: this.config })
      : null;

    this.gatherer = new ChunkGatherer({ config: this.config });

    this.checker = this.llm
      ? new CompletenessChecker({ llm: this.llm, config: this.config })
      : null;

    this.synthesizer = this.llm
      ? new ResponseSynthesizer({ llm: this.llm, config: this.config })
      : null;

    this.compressor = new ResponseCompressor({
      llm: this.llm ?? undefined,
      config: this.config.compression,
    });

    // Initialize query cache with optional broker
    this.queryCache = new QueryCache({
      maxSize: 100,
      ttlByMode: {
        instant: 2 * 60 * 1000,   // 2 minutes
        auto: 5 * 60 * 1000,      // 5 minutes
        thinking: 15 * 60 * 1000, // 15 minutes
      },
      broker: options.broker, // Pass broker for persistent caching
    });

    // Initialize analytics
    this.analytics = createMindAnalytics({
      enabled: options.analytics?.enabled ?? true,
      detailed: options.analytics?.detailed ?? false,
      llmModel: this.config.llm.model,
      analyticsAdapter: options.analyticsAdapter ?? null,
    });
  }

  /**
   * Execute orchestrated query
   */
  async query(
    options: OrchestratorQueryOptions,
    queryFn: QueryFn,
  ): Promise<OrchestratorResult> {
    const requestId = generateRequestId();
    const hasCacheContext =
      typeof options.indexRevision === 'string' &&
      options.indexRevision.length > 0 &&
      typeof options.engineConfigHash === 'string' &&
      options.engineConfigHash.length > 0;

    // Determine mode early for cache lookup
    let mode = options.mode ?? this.config.mode;

    // Check cache first (before analytics to avoid overhead)
    if (!options.noCache && hasCacheContext) {
      const cached = await this.queryCache.get(
        options.text,
        options.scopeId ?? 'default',
        mode,
        options.indexRevision!,
        options.engineConfigHash!,
        options.sourcesDigest,
      );

      if (cached) {
        // Cache hit - return immediately
        return cached;
      }
    }

    // Create analytics context
    const analyticsCtx = this.analytics.createContext({
      queryId: requestId,
      scopeId: options.scopeId ?? 'default',
      mode: mode,
    });

    // Track query start
    await this.analytics.trackQueryStart({
      queryId: requestId,
      text: options.text,
      mode: analyticsCtx.mode,
      scopeId: analyticsCtx.scopeId,
      agentMode: true,
    });

    try {
      // Mode already determined above for cache lookup

      // Auto-detect complexity if in auto mode
      if (mode === 'auto' && this.decomposer && this.config.autoDetectComplexity) {
        const complexity = await this.decomposer.detectComplexity(options.text);
        mode = complexity.suggestedMode;
        analyticsCtx.mode = mode;
      }

      // Execute mode-specific pipeline
      let result: AgentResponse;
      let subqueries: string[] = [];

      if (mode === 'instant') {
        result = await this.executeInstantMode(options, queryFn, requestId);

        // Auto-fallback: if instant mode has low confidence, upgrade to auto mode
        const LOW_CONFIDENCE_THRESHOLD = 0.3;
        if (result.confidence < LOW_CONFIDENCE_THRESHOLD && this.llm) {
          // Log the fallback (confidence tracked in analytics automatically)

          // Upgrade to auto mode
          mode = 'auto';
          analyticsCtx.mode = mode;
          const autoResult = await this.executeAutoModeWithAnalytics(options, queryFn, requestId, analyticsCtx);
          result = autoResult.result;
          subqueries = autoResult.subqueries;
        }
      } else if (mode === 'thinking') {
        const thinkingResult = await this.executeThinkingModeWithAnalytics(options, queryFn, requestId, analyticsCtx);
        result = thinkingResult.result;
        subqueries = thinkingResult.subqueries;
      } else {
        const autoResult = await this.executeAutoModeWithAnalytics(options, queryFn, requestId, analyticsCtx);
        result = autoResult.result;
        subqueries = autoResult.subqueries;
      }

      // Update timing
      result.meta.timingMs = Date.now() - analyticsCtx.startTime;
      result.meta.mode = mode;

      this.analytics.updateContext(analyticsCtx, { subqueries });

      // Compress if needed
      const compressed = await this.compressor.compress(result);

      // Check if compression was applied
      if (compressed !== result) {
        this.analytics.updateContext(analyticsCtx, { compressionApplied: true });
      }

      // Store in cache
      if (!options.noCache && hasCacheContext) {
        await this.queryCache.set(
          options.text,
          options.scopeId ?? 'default',
          mode,
          options.indexRevision!,
          options.engineConfigHash!,
          options.sourcesDigest,
          compressed,
        );
      }

      // Track successful completion
      await this.analytics.trackQueryCompleted(analyticsCtx, compressed);

      return compressed;
    } catch (error) {
      const errorResponse = this.createErrorResponse(error, requestId, Date.now() - analyticsCtx.startTime);

      // Track failure
      await this.analytics.trackQueryFailed(analyticsCtx, errorResponse);

      return errorResponse;
    }
  }

  /**
   * Auto mode with analytics tracking
   */
  private async executeAutoModeWithAnalytics(
    options: OrchestratorQueryOptions,
    queryFn: QueryFn,
    requestId: string,
    analyticsCtx: MindAnalyticsContext,
  ): Promise<{ result: AgentResponse; subqueries: string[] }> {
    // Decompose query
    const decomposed = this.decomposer
      ? await this.decomposer.decompose(options.text, 'auto')
      : { original: options.text, subqueries: [options.text] };

    // Track decompose stage
    await this.analytics.trackStage('decompose', analyticsCtx, {
      subqueriesCount: decomposed.subqueries.length,
    });

    // Gather chunks
    const gathered = await this.gatherer.gather(decomposed, 'auto', queryFn);
    await this.enforceRetrievalContextConsistency(options, gathered.retrieval);

    // Track gather stage
    await this.analytics.trackStage('gather', analyticsCtx, {
      chunksFound: gathered.chunks.length,
      totalMatches: gathered.totalMatches,
      retrieval: gathered.retrieval,
    });
    this.analytics.updateContext(analyticsCtx, { retrieval: gathered.retrieval });

    // Check completeness (single iteration)
    if (this.checker) {
      const completeness = await this.checker.check(options.text, gathered.chunks, 'auto');
      this.analytics.updateContext(analyticsCtx, { iterations: 1 });

      // Track check stage
      await this.analytics.trackStage('check', analyticsCtx, {
        complete: completeness.complete,
        confidence: completeness.confidence,
      });
    }

    // Synthesize response
    const result = await this.buildResponse(
      options.text,
      gathered.chunks,
      'auto',
      requestId,
      options.debug,
      decomposed.subqueries,
      gathered.totalMatches,
      gathered.retrieval,
    );

    // Track synthesize stage
    await this.analytics.trackStage('synthesize', analyticsCtx, {
      sourcesCount: result.sources.length,
      confidence: result.confidence,
      retrieval: gathered.retrieval,
    });

    return { result, subqueries: decomposed.subqueries };
  }

  /**
   * Thinking mode with analytics tracking
   */
  private async executeThinkingModeWithAnalytics(
    options: OrchestratorQueryOptions,
    queryFn: QueryFn,
    requestId: string,
    analyticsCtx: MindAnalyticsContext,
  ): Promise<{ result: AgentResponse; subqueries: string[] }> {
    // Deep decomposition
    const decomposed = this.decomposer
      ? await this.decomposer.decompose(options.text, 'thinking')
      : { original: options.text, subqueries: [options.text] };

    // Track decompose stage
    await this.analytics.trackStage('decompose', analyticsCtx, {
      subqueriesCount: decomposed.subqueries.length,
      mode: 'thinking',
    });

    // Gather chunks
    const gathered = await this.gatherer.gather(decomposed, 'thinking', queryFn);
    await this.enforceRetrievalContextConsistency(options, gathered.retrieval);

    // Early deduplication - reduce tokens for completeness check
    gathered.chunks = this.deduplicateChunks(gathered.chunks);

    // Track gather stage
    await this.analytics.trackStage('gather', analyticsCtx, {
      chunksFound: gathered.chunks.length,
      totalMatches: gathered.totalMatches,
      retrieval: gathered.retrieval,
    });
    this.analytics.updateContext(analyticsCtx, { retrieval: gathered.retrieval });

    // Iterative completeness checking
    const maxIterations = this.config.modes.thinking.maxIterations;
    let iteration = 0;

    while (this.checker && iteration < maxIterations) {
      const completeness = await this.checker.check(options.text, gathered.chunks, 'thinking');
      this.analytics.updateContext(analyticsCtx, { iterations: iteration + 1 });

      // Track check stage
      await this.analytics.trackStage('check', analyticsCtx, {
        complete: completeness.complete,
        confidence: completeness.confidence,
        iteration: iteration + 1,
      });

      // Early exit conditions:
      // 1. Marked as complete
      // 2. High confidence (>0.8) - good enough
      // 3. No suggestions for improvement
      if (completeness.complete || completeness.confidence > 0.8 || !completeness.suggestSources?.length) {
        break;
      }

      // Try additional queries based on suggestions
      for (const suggestion of completeness.suggestSources.slice(0, 2)) {
        if (suggestion.query) {
          const additionalResult = await queryFn({
            text: suggestion.query,
            intent: 'search',
            limit: this.config.modes.thinking.chunksPerQuery,
          });
          gathered.chunks.push(...additionalResult.chunks);
          gathered.totalMatches += additionalResult.chunks.length;
        }
      }

      // Deduplicate after each iteration to reduce token count
      gathered.chunks = this.deduplicateChunks(gathered.chunks);

      iteration++;
    }

    // Chunks already deduplicated during iterations
    const uniqueChunks = gathered.chunks;

    // Synthesize response
    const result = await this.buildResponse(
      options.text,
      uniqueChunks,
      'thinking',
      requestId,
      options.debug,
      decomposed.subqueries,
      gathered.totalMatches,
      gathered.retrieval,
    );

    // Track synthesize stage
    await this.analytics.trackStage('synthesize', analyticsCtx, {
      sourcesCount: result.sources.length,
      confidence: result.confidence,
      iterations: iteration + 1,
      retrieval: gathered.retrieval,
    });

    return { result, subqueries: decomposed.subqueries };
  }

  /**
   * Instant mode - fast, minimal LLM with adaptive search weights
   */
  private async executeInstantMode(
    options: OrchestratorQueryOptions,
    queryFn: QueryFn,
    requestId: string,
  ): Promise<AgentResponse> {
    // Classify query for adaptive search weights
    const classification = classifyQuery(options.text);

    // Use classification-based limit and weights
    const limit = Math.max(
      this.config.modes.instant.maxChunks,
      classification.suggestedLimit,
    );

    // Direct query with adaptive weights
    const result = await queryFn({
      text: options.text,
      intent: 'search',
      limit,
      vectorWeight: classification.weights.vector,
      keywordWeight: classification.weights.keyword,
    });
    const retrieval = extractRetrievalTelemetry(result.metadata);
    await this.enforceRetrievalContextConsistency(options, retrieval);

    // Build response
    return this.buildResponse(
      options.text,
      result.chunks,
      'instant',
      requestId,
      options.debug,
      undefined,
      result.chunks.length,
      retrieval,
    );
  }

  private async enforceRetrievalContextConsistency(
    options: OrchestratorQueryOptions,
    retrieval?: RetrievalTelemetry,
  ): Promise<void> {
    const expectedIndexRevision = options.indexRevision;
    const expectedEngineConfigHash = options.engineConfigHash;
    const expectedSourcesDigest = options.sourcesDigest;

    if (
      typeof expectedIndexRevision !== 'string' ||
      expectedIndexRevision.length === 0 ||
      typeof expectedEngineConfigHash !== 'string' ||
      expectedEngineConfigHash.length === 0
    ) {
      return;
    }

    if (!retrieval) {
      await this.queryCache.invalidateScope(options.scopeId ?? 'default');
      throw new Error('INDEX_CONTEXT_MISMATCH: missing retrieval telemetry for context validation');
    }

    const actualIndexRevision = retrieval.indexRevision;
    const actualEngineConfigHash = retrieval.engineConfigHash;
    const actualSourcesDigest = retrieval.sourcesDigest;

    const indexRevisionMismatch =
      typeof actualIndexRevision !== 'string' ||
      actualIndexRevision.length === 0 ||
      actualIndexRevision !== expectedIndexRevision;
    const engineConfigMismatch =
      typeof actualEngineConfigHash !== 'string' ||
      actualEngineConfigHash.length === 0 ||
      actualEngineConfigHash !== expectedEngineConfigHash;
    const sourcesDigestMismatch =
      typeof expectedSourcesDigest === 'string' && expectedSourcesDigest.length > 0 &&
      (
        typeof actualSourcesDigest !== 'string' ||
        actualSourcesDigest.length === 0 ||
        actualSourcesDigest !== expectedSourcesDigest
      );

    if (indexRevisionMismatch || engineConfigMismatch || sourcesDigestMismatch) {
      await this.queryCache.invalidateScope(options.scopeId ?? 'default');
      throw new Error(
        [
          'INDEX_CONTEXT_MISMATCH:',
          `expected indexRevision=${expectedIndexRevision}, engineConfigHash=${expectedEngineConfigHash};`,
          `actual indexRevision=${String(actualIndexRevision)}, engineConfigHash=${String(actualEngineConfigHash)};`,
          `expected sourcesDigest=${String(expectedSourcesDigest)}, actual sourcesDigest=${String(actualSourcesDigest)}`,
        ].join(' '),
      );
    }
  }

  /**
   * Build final AgentResponse
   */
  private async buildResponse(
    query: string,
    chunks: MindChunk[],
    mode: AgentQueryMode,
    requestId: string,
    debug?: boolean,
    subqueries?: string[],
    totalMatches?: number,
    retrieval?: RetrievalTelemetry,
  ): Promise<AgentResponse> {
    // Use synthesizer if available, otherwise build direct response
    const synthesis = this.synthesizer
      ? await this.synthesizer.synthesize(query, chunks, mode)
      : this.buildDirectResponse(chunks);

    // Calculate sources summary
    const sourcesSummary = this.calculateSourcesSummary(synthesis.sources);

    // Build meta
    const meta: AgentMeta = {
      schemaVersion: AGENT_RESPONSE_SCHEMA_VERSION,
      requestId,
      mode,
      timingMs: 0, // Will be updated by caller
      cached: false,
      indexVersion: retrieval?.indexRevision ?? undefined,
    };

    const response: AgentResponse = {
      answer: synthesis.answer,
      sources: synthesis.sources,
      confidence: synthesis.confidence,
      complete: synthesis.complete,
      suggestions: 'suggestions' in synthesis ? synthesis.suggestions : undefined,
      sourcesSummary,
      meta,
    };

    // Add debug info if requested
    if (debug) {
      response.debug = {
        matchesTotal: totalMatches ?? chunks.length,
        matchesUsed: synthesis.sources.length,
        subqueries,
        dedupStrategy: 'highest-score',
        compressionApplied: false,
      };
    }

    return response;
  }

  /**
   * Build direct response without LLM
   */
  private buildDirectResponse(chunks: MindChunk[]) {
    if (chunks.length === 0) {
      return {
        answer: 'No relevant code found.',
        sources: [],
        confidence: 0,
        complete: false,
      };
    }

    const topChunk = chunks[0];
    if (!topChunk) {
      return {
        answer: 'No results found',
        sources: [],
        confidence: 0,
        complete: false,
      };
    }

    return {
      answer: `Found in ${topChunk.path} (lines ${topChunk.span.startLine}-${topChunk.span.endLine})`,
      sources: chunks.slice(0, 5).map(chunk => ({
        file: chunk.path,
        lines: [chunk.span.startLine, chunk.span.endLine] as [number, number],
        snippet: chunk.text.slice(0, 500),
        relevance: `Score: ${chunk.score.toFixed(2)}`,
        kind: 'code' as const,
      })),
      confidence: topChunk.score,
      complete: topChunk.score > 0.8,
    };
  }

  /**
   * Calculate sources summary
   */
  private calculateSourcesSummary(sources: Array<{ kind: string }>): AgentSourcesSummary {
    const summary: AgentSourcesSummary = {
      code: 0,
      docs: 0,
      external: {},
    };

    for (const source of sources) {
      switch (source.kind) {
        case 'code':
        case 'config':
          summary.code++;
          break;
        case 'doc':
        case 'adr':
          summary.docs++;
          break;
        case 'external':
          summary.external['other'] = (summary.external['other'] ?? 0) + 1;
          break;
      }
    }

    return summary;
  }

  /**
   * Deduplicate chunks by ID
   */
  private deduplicateChunks(chunks: MindChunk[]): MindChunk[] {
    const seen = new Map<string, MindChunk>();
    for (const chunk of chunks) {
      const chunkId = chunk.id ?? chunk.chunkId ?? `${chunk.path}:${chunk.span.startLine}-${chunk.span.endLine}`;
      const existing = seen.get(chunkId);
      const chunkScore = chunk.score ?? 0;
      if (!existing || chunkScore > (existing.score ?? 0)) {
        seen.set(chunkId, chunk);
      }
    }
    return Array.from(seen.values()).sort((a, b) => b.score - a.score);
  }

  /**
   * Invalidate query cache for specific scopes (e.g., after re-indexing)
   * @param scopeIds - Optional array of scope IDs to invalidate. If not provided, clears entire cache.
   * @returns Number of cache entries invalidated
   */
  async invalidateCache(scopeIds?: string[]): Promise<number> {
    if (!scopeIds || scopeIds.length === 0) {
      // Clear entire cache
      return this.queryCache.clear();
    }

    // Invalidate specific scopes
    let totalInvalidated = 0;
    for (const scopeId of scopeIds) {
      totalInvalidated += await this.queryCache.invalidateScope(scopeId);
    }
    return totalInvalidated;
  }

  /**
   * Get query cache statistics
   */
  getCacheStats() {
    return this.queryCache.stats();
  }

  /**
   * Create error response
   */
  private createErrorResponse(
    error: unknown,
    requestId: string,
    timingMs: number,
  ): AgentErrorResponse {
    const message = error instanceof Error ? error.message : String(error);

    // Determine error code
    let code: AgentErrorResponse['error']['code'] = 'ENGINE_ERROR';
    let recoverable = true;

    if (message.includes('timeout') || message.includes('TIMEOUT')) {
      code = 'TIMEOUT';
      recoverable = true;
    } else if (message.includes('INDEX_CONTEXT_MISMATCH')) {
      code = 'INDEX_NOT_FOUND';
      recoverable = true;
    } else if (message.includes('LLM') || message.includes('OpenAI')) {
      code = 'LLM_ERROR';
      recoverable = true;
    } else if (message.includes('index') || message.includes('INDEX')) {
      code = 'INDEX_NOT_FOUND';
      recoverable = false;
    }

    return {
      error: {
        code,
        message,
        recoverable,
      },
      meta: {
        schemaVersion: AGENT_RESPONSE_SCHEMA_VERSION,
        requestId,
        mode: this.config.mode,
        timingMs,
        cached: false,
      },
    };
  }
}

function extractRetrievalTelemetry(metadata?: Record<string, unknown>): RetrievalTelemetry | undefined {
  if (!metadata || typeof metadata !== 'object') {
    return undefined;
  }
  const hasRequired =
    typeof metadata.retrievalProfile === 'string' &&
    typeof metadata.stalenessLevel === 'string' &&
    typeof metadata.failClosed === 'boolean';
  if (!hasRequired) {
    return undefined;
  }
  return metadata as RetrievalTelemetry;
}

/**
 * Create orchestrator instance
 */
export function createAgentQueryOrchestrator(
  options: AgentQueryOrchestratorOptions = {},
): AgentQueryOrchestrator {
  return new AgentQueryOrchestrator(options);
}
