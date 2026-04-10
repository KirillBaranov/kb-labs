import { createHash } from 'node:crypto';
import type { KnowledgeQuery, KnowledgeExecutionContext } from '../types/engine-contracts';
import type { ComplexityDetector } from './complexity-detector';
import type { QueryPlanner } from './query-planner';
import type { ParallelExecutor, QueryExecutor } from './parallel-executor';
import type { ResultSynthesizer } from './synthesizer';
import type { QueryPlan, ReasoningResult, ReasoningContext } from './types';
import type { ContextOptimizer } from '../optimization/index';
import type { LLMCompressor } from '../compression/llm-compressor';
import type { QueryHistoryStore } from '../learning/query-history';
import type { RuntimeAdapter } from '../adapters/runtime-adapter';
import type { ProgressEvent } from '../index';

export interface ReasoningEngineOptions {
  /**
   * Maximum depth for recursive reasoning
   * Default: 3
   */
  maxDepth?: number;
  
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
  
  /**
   * Progress callback for tracking execution stages
   */
  onProgress?: (event: ProgressEvent) => void;
}

export class ReasoningEngine {
  private readonly maxDepth: number;
  private readonly maxTotalQueries: number;
  private readonly maxTokensPerDepth: number;
  private readonly cyclicDetection: boolean;
  
  private readonly complexityDetector: ComplexityDetector;
  private readonly queryPlanner: QueryPlanner;
  private readonly parallelExecutor: ParallelExecutor;
  private readonly synthesizer: ResultSynthesizer;
  private readonly contextOptimizer: ContextOptimizer | null;
  private readonly llmCompressor: LLMCompressor | null;
  private readonly queryHistory: QueryHistoryStore | null;
  private readonly runtime: RuntimeAdapter | null;
  private readonly onProgress?: (event: ProgressEvent) => void;

  constructor(
    options: ReasoningEngineOptions,
    complexityDetector: ComplexityDetector,
    queryPlanner: QueryPlanner,
    parallelExecutor: ParallelExecutor,
    synthesizer: ResultSynthesizer,
    contextOptimizer?: ContextOptimizer | null,
    llmCompressor?: LLMCompressor | null,
    queryHistory?: QueryHistoryStore | null,
    runtime?: RuntimeAdapter | null,
  ) {
    this.maxDepth = options.maxDepth ?? 3;
    this.maxTotalQueries = options.maxTotalQueries ?? 20;
    this.maxTokensPerDepth = options.maxTokensPerDepth ?? 10000;
    this.cyclicDetection = options.cyclicDetection ?? true;
    
    this.complexityDetector = complexityDetector;
    this.queryPlanner = queryPlanner;
    this.parallelExecutor = parallelExecutor;
    this.synthesizer = synthesizer;
    this.contextOptimizer = contextOptimizer ?? null;
    this.llmCompressor = llmCompressor ?? null;
    this.queryHistory = queryHistory ?? null;
    this.runtime = runtime ?? null;
    this.onProgress = options.onProgress;
  }

  /**
   * Report progress event
   */
  private reportProgress(stage: string, details?: string, data?: Record<string, unknown>): void {
    if (this.onProgress) {
      this.onProgress({
        stage,
        details,
        timestamp: Date.now(),
        metadata: data,
      });
    }
  }

  /**
   * Execute reasoning chain for a query
   */
  async execute(
    query: KnowledgeQuery,
    context: KnowledgeExecutionContext,
    executor: QueryExecutor,
    initialDepth: number = 0,
  ): Promise<ReasoningResult> {
    const startTime = Date.now();
    
    // Initialize reasoning context
    const reasoningContext: ReasoningContext = {
      depth: initialDepth,
      maxDepth: this.maxDepth,
      queryPath: [query.text],
      totalQueries: 0,
      maxTotalQueries: this.maxTotalQueries,
      tokensUsed: 0,
      maxTokensPerDepth: this.maxTokensPerDepth,
    };

    // Check depth limit - if already at max depth, execute directly without reasoning
    if (reasoningContext.depth >= reasoningContext.maxDepth) {
      const result = await executor(query, context);
      return {
        ...result,
        metadata: {
          ...result.metadata,
          reasoning: {
            complexityScore: 0,
            plan: {
              originalQuery: query.text,
              complexityScore: 0,
              subqueries: [{
                text: query.text,
                priority: 1,
                groupId: 0,
                relevance: 1,
              }],
            },
            depth: reasoningContext.depth,
            subqueriesCount: 1,
            parallelExecuted: 1,
            timing: {
              planningTimeMs: 0,
              executionTimeMs: 0,
              synthesisTimeMs: 0,
              totalTimeMs: Date.now() - startTime,
            },
          },
        },
      };
    }

    // Detect complexity
    const planningStartTime = Date.now();
    this.reportProgress('analyzing_query_complexity');
    const complexity = await this.complexityDetector.detectComplexity(query.text);
    
    if (!complexity.needsReasoning) {
      // Simple query - execute directly without reasoning
      this.reportProgress('query_is_simple', 'executing directly');
      const result = await executor(query, context);
      return {
        ...result,
        metadata: {
          ...result.metadata,
          reasoning: {
            complexityScore: complexity.score,
            plan: {
              originalQuery: query.text,
              complexityScore: complexity.score,
              subqueries: [{
                text: query.text,
                priority: 1,
                groupId: 0,
                relevance: 1,
              }],
            },
            depth: reasoningContext.depth,
            subqueriesCount: 1,
            parallelExecuted: 1,
            timing: {
              planningTimeMs: Date.now() - planningStartTime,
              executionTimeMs: 0,
              synthesisTimeMs: 0,
              totalTimeMs: Date.now() - startTime,
            },
          },
        },
      };
    }

    // Generate query plan
    this.reportProgress('planning_query');
    const plan = await this.queryPlanner.plan(query.text, complexity.score);
    const planningTimeMs = Date.now() - planningStartTime;
    this.reportProgress('query_plan_generated', `${plan.subqueries.length} subqueries`, { 
      subqueries: plan.subqueries.length,
      complexityScore: complexity.score 
    });

    // Check for cycles
    if (this.cyclicDetection && this.hasCycle(reasoningContext.queryPath, plan.subqueries)) {
      throw new Error('Cyclic reasoning detected - query path contains duplicates');
    }

    // Update reasoning context
    reasoningContext.queryPath.push(...plan.subqueries.map(sq => sq.text));
    reasoningContext.totalQueries += plan.subqueries.length;

    // Execute sub-queries
    const executionStartTime = Date.now();
    this.reportProgress('executing_subqueries', `${plan.subqueries.length} queries`, { count: plan.subqueries.length });
    const subResults = await this.parallelExecutor.execute(
      plan,
      context,
      executor,
      reasoningContext,
    );
    const executionTimeMs = Date.now() - executionStartTime;
    this.reportProgress('subqueries_completed', `${subResults.length} completed`, { 
      completed: subResults.length,
      totalChunks: subResults.reduce((sum, r) => sum + r.chunks.length, 0)
    });

    // Combine chunks from all sub-results
    const allChunks = subResults.flatMap(result => result.chunks);
    
    // Apply context optimization before synthesis if enabled
    let optimizedChunks = allChunks;
    if (this.contextOptimizer && allChunks.length > 0) {
      // Convert chunks to VectorSearchMatch format for optimizer
      const matches = allChunks.map(chunk => ({
        chunk: {
          chunkId: chunk.id ?? `${chunk.path}:${chunk.span.startLine}-${chunk.span.endLine}`,
          scopeId: context.scope.id,
          sourceId: chunk.sourceId ?? 'unknown',
          path: chunk.path,
          span: chunk.span,
          text: chunk.text,
          metadata: chunk.metadata,
          embedding: { dim: 0, values: [] }, // Dummy embedding - not used by optimizer
        },
        score: chunk.score ?? 0,
      }));
      
      const optimized = this.contextOptimizer.optimize(matches, {
        maxChunks: (context.limit ?? 20) * 2, // Allow more chunks for reasoning
        deduplication: true,
        deduplicationThreshold: 0.9,
        diversification: true,
        diversityThreshold: 0.3,
        maxChunksPerFile: 5, // More chunks per file for reasoning
      });
      
      optimizedChunks = optimized;
      
      this.runtime?.log?.('debug', 'Applied context optimization to reasoning results', {
        originalChunks: allChunks.length,
        optimizedChunks: optimizedChunks.length,
      });
    }

    // Synthesize results
    const synthesisStartTime = Date.now();
    this.reportProgress('synthesizing_context', `${optimizedChunks.length} chunks`, {
      chunks: optimizedChunks.length
    });
    // Use optimized chunks if available, otherwise use original results
    const resultsToSynthesize = optimizedChunks.length !== allChunks.length
      ? subResults.map(result => ({
          ...result,
          chunks: optimizedChunks.filter(chunk => 
            result.chunks.some(c => c.id === chunk.id)
          ),
        }))
      : subResults;
    
    const synthesisResult = await this.synthesizer.synthesize(
      resultsToSynthesize,
      query.text,
    );
    const synthesisTimeMs = Date.now() - synthesisStartTime;
    this.reportProgress('context_synthesis_completed', `${synthesisResult.chunks.length} final chunks`, {
      contextLength: synthesisResult.contextText.length,
      finalChunks: synthesisResult.chunks.length
    });

    // Apply compression to synthesized context if enabled
    // Note: LLMCompressor.compress expects a KnowledgeChunk, so we create a temporary chunk
    let finalContextText = synthesisResult.contextText;
    if (this.llmCompressor && finalContextText) {
      try {
        // Create a temporary chunk for compression
        const tempChunk = {
          id: 'reasoning-synthesis',
          sourceId: 'reasoning',
          path: 'reasoning-context',
          span: { startLine: 0, endLine: 0 },
          text: finalContextText,
          score: 1.0,
        };
        
        const compressed = await this.llmCompressor.compress(tempChunk, query.text);
        finalContextText = compressed;
        
        this.runtime?.log?.('debug', 'Applied compression to reasoning context', {
          originalLength: synthesisResult.contextText.length,
          compressedLength: compressed.length,
          compressionRatio: (compressed.length / synthesisResult.contextText.length).toFixed(2),
        });
      } catch (error) {
        this.runtime?.log?.('warn', 'Failed to compress reasoning context', {
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with uncompressed text
      }
    }
    
    // Save reasoning plan to query history if enabled
    if (this.queryHistory && context.scope.id) {
      try {
        // Generate query hash for reasoning plan
        const queryHash = this.generateQueryHash(query.text);
        
        // Save reasoning metadata to query history
        // Note: This extends the existing query history entry if one exists
        await this.queryHistory.saveReasoningPlan({
          queryHash,
          scopeId: context.scope.id,
          plan,
          complexityScore: complexity.score,
          subqueriesCount: plan.subqueries.length,
          parallelExecuted: subResults.length,
          timing: {
            planningTimeMs,
            executionTimeMs,
            synthesisTimeMs,
            totalTimeMs: Date.now() - startTime,
          },
        });
        
        this.runtime?.log?.('debug', 'Saved reasoning plan to query history', {
          queryHash,
          subqueriesCount: plan.subqueries.length,
        });
      } catch (error) {
        this.runtime?.log?.('warn', 'Failed to save reasoning plan to query history', {
          error: error instanceof Error ? error.message : String(error),
        });
        // Don't fail the query if history save fails
      }
    }

    // Log reasoning metrics
    this.runtime?.log?.('info', 'Reasoning chain completed', {
      complexityScore: complexity.score,
      subqueriesCount: plan.subqueries.length,
      parallelExecuted: subResults.length,
      totalChunks: synthesisResult.chunks.length,
      originalChunks: synthesisResult.originalChunkCount,
      deduplicatedChunks: synthesisResult.deduplicatedChunkCount,
      timing: {
        planningTimeMs,
        executionTimeMs,
        synthesisTimeMs,
        totalTimeMs: Date.now() - startTime,
      },
    });

    this.runtime?.analytics?.metric('reasoning.total_time_ms', Date.now() - startTime, {
      complexity_score: complexity.score.toFixed(2),
      subqueries_count: String(plan.subqueries.length),
    });

    this.runtime?.analytics?.metric('reasoning.subqueries_count', plan.subqueries.length);
    this.runtime?.analytics?.metric('reasoning.parallel_executed', subResults.length);

    // Create final result
    const result: ReasoningResult = {
      query,
      chunks: synthesisResult.chunks,
      contextText: finalContextText,
      engineId: undefined, // Will be set by caller
      generatedAt: new Date().toISOString(),
      metadata: {
        reasoning: {
          complexityScore: complexity.score,
          plan,
          depth: reasoningContext.depth,
          subqueriesCount: plan.subqueries.length,
          parallelExecuted: subResults.length,
          timing: {
            planningTimeMs,
            executionTimeMs,
            synthesisTimeMs,
            totalTimeMs: Date.now() - startTime,
          },
          tokensSaved: synthesisResult.originalChunkCount > synthesisResult.deduplicatedChunkCount
            ? synthesisResult.originalChunkCount - synthesisResult.deduplicatedChunkCount
            : undefined,
        },
      },
    };

    return result;
  }

  /**
   * Check if query path contains cycles
   */
  private hasCycle(queryPath: string[], subqueries: QueryPlan['subqueries']): boolean {
    const normalizedPath = queryPath.map(q => q.toLowerCase().trim());
    const normalizedSubqueries = subqueries.map(sq => sq.text.toLowerCase().trim());
    
    // Check if any sub-query is similar to previous queries in path
    for (const subquery of normalizedSubqueries) {
      for (const pathQuery of normalizedPath) {
        if (this.textSimilarity(subquery, pathQuery) > 0.9) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Simple text similarity
   */
  private textSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.split(/\s+/));
    const words2 = new Set(text2.split(/\s+/));
    
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Generate query hash for query history
   */
  private generateQueryHash(queryText: string): string {
    return createHash('sha256')
      .update(queryText.toLowerCase().trim())
      .digest('hex');
  }
}
