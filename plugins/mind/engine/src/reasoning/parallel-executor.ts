import { useLogger } from '@kb-labs/sdk';
import type { KnowledgeQuery, KnowledgeResult, KnowledgeExecutionContext } from '../types/engine-contracts';
import type { QueryPlan, ReasoningContext } from './types';

const getParallelLogger = () => useLogger().child({ category: 'mind:engine:reasoning:parallel' });

export interface ParallelExecutorOptions {
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
}

export interface QueryExecutor {
  (query: KnowledgeQuery, context: KnowledgeExecutionContext): Promise<KnowledgeResult>;
}

export class ParallelExecutor {
  private readonly parallel: boolean;
  private readonly maxConcurrency: number;
  private readonly timeoutMs: number;
  private readonly earlyStopping: {
    enabled: boolean;
    minConfidence: number;
    minChunksFound: number;
  };

  constructor(options: ParallelExecutorOptions) {
    this.parallel = options.parallel ?? true;
    this.maxConcurrency = options.maxConcurrency ?? 3;
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.earlyStopping = {
      enabled: options.earlyStopping?.enabled ?? true,
      minConfidence: options.earlyStopping?.minConfidence ?? 0.8,
      minChunksFound: options.earlyStopping?.minChunksFound ?? 5,
    };
  }

  /**
   * Execute sub-queries from the plan
   * Returns array of KnowledgeResult, one per sub-query
   */
  async execute(
    plan: QueryPlan,
    context: KnowledgeExecutionContext,
    executor: QueryExecutor,
    reasoningContext: ReasoningContext,
  ): Promise<KnowledgeResult[]> {
    // Check safety limits
    if (reasoningContext.totalQueries >= reasoningContext.maxTotalQueries) {
      throw new Error(`Maximum total queries limit reached: ${reasoningContext.maxTotalQueries}`);
    }

    if (reasoningContext.depth >= reasoningContext.maxDepth) {
      throw new Error(`Maximum depth limit reached: ${reasoningContext.maxDepth}`);
    }

    const subqueries = plan.subqueries;
    const results: KnowledgeResult[] = [];

    if (!this.parallel || subqueries.length === 1) {
      // Sequential execution
      for (const subquery of subqueries) {
        if (reasoningContext.totalQueries >= reasoningContext.maxTotalQueries) {
          break;
        }

        try {
          const result = await this.executeWithTimeout(
            subquery,
            context,
            executor,
            reasoningContext,
          );
          results.push(result);

          // Check early stopping
          if (this.earlyStopping.enabled && this.shouldStopEarly(result)) {
            break;
          }
        } catch (error) {
          // Log error but continue with other queries
          getParallelLogger().warn(`Failed to execute sub-query "${subquery.text}"`, { error });
        }
      }
    } else {
      // Parallel execution with concurrency limit
      const groups = this.groupSubqueries(subqueries);
      
      for (const group of groups) {
        if (reasoningContext.totalQueries >= reasoningContext.maxTotalQueries) {
          break;
        }

        // Execute group in parallel
        const groupPromises = group.map(subquery =>
          this.executeWithTimeout(subquery, context, executor, reasoningContext)
            .catch(error => {
              getParallelLogger().warn(`Failed to execute sub-query "${subquery.text}"`, { error });
              return null;
            })
        );

        const groupResults = await Promise.all(groupPromises);
        
        // Filter out null results and add to results
        for (const result of groupResults) {
          if (result) {
            results.push(result);
            
            // Check early stopping
            if (this.earlyStopping.enabled && this.shouldStopEarly(result)) {
              return results;
            }
          }
        }
      }
    }

    return results;
  }

  /**
   * Execute a single sub-query with timeout
   */
  private async executeWithTimeout(
    subquery: { text: string },
    context: KnowledgeExecutionContext,
    executor: QueryExecutor,
    reasoningContext: ReasoningContext,
  ): Promise<KnowledgeResult> {
    const query: KnowledgeQuery = {
      productId: context.scope.id, // Use scope ID as product ID for sub-queries
      scopeId: context.scope.id,
      text: subquery.text,
      intent: 'search',
    };

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Query timeout')), this.timeoutMs);
    });

    const executionPromise = executor(query, context);

    return Promise.race([executionPromise, timeoutPromise]);
  }

  /**
   * Group sub-queries for parallel execution based on groupId
   */
  private groupSubqueries(subqueries: QueryPlan['subqueries']): QueryPlan['subqueries'][] {
    const groups = new Map<number, QueryPlan['subqueries']>();

    for (const subquery of subqueries) {
      const groupId = subquery.groupId;
      if (!groups.has(groupId)) {
        groups.set(groupId, []);
      }
      groups.get(groupId)!.push(subquery);
    }

    // Split large groups to respect maxConcurrency
    const result: QueryPlan['subqueries'][] = [];
    for (const group of groups.values()) {
      if (group.length <= this.maxConcurrency) {
        result.push(group);
      } else {
        // Split into chunks
        for (let i = 0; i < group.length; i += this.maxConcurrency) {
          result.push(group.slice(i, i + this.maxConcurrency));
        }
      }
    }

    return result;
  }

  /**
   * Check if we should stop early based on results
   */
  private shouldStopEarly(result: KnowledgeResult): boolean {
    if (result.chunks.length < this.earlyStopping.minChunksFound) {
      return false;
    }

    // Check if average score is high enough
    const avgScore = result.chunks.reduce((sum, chunk) => {
      return sum + (chunk.score ?? 0);
    }, 0) / result.chunks.length;

    return avgScore >= this.earlyStopping.minConfidence;
  }
}

