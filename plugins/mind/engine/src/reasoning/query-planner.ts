import type { ILLM } from '@kb-labs/sdk';
import type { QueryPlan, SubQuery } from './types';

export interface QueryPlannerOptions {
  /**
   * Maximum number of sub-queries to generate
   * Default: 5
   */
  maxSubqueries?: number;
  
  /**
   * LLM model to use for planning
   * Default: 'gpt-4o-mini'
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
}

export class QueryPlanner {
  private readonly maxSubqueries: number;
  private readonly llmEngine: ILLM | null;
  private readonly model: string;
  private readonly temperature: number;
  private readonly minSimilarity: number;

  constructor(
    options: QueryPlannerOptions,
    llmEngine: ILLM | null,
  ) {
    this.maxSubqueries = options.maxSubqueries ?? 5;
    this.llmEngine = llmEngine;
    this.model = options.model ?? 'gpt-4o-mini';
    this.temperature = options.temperature ?? 0.3;
    this.minSimilarity = options.minSimilarity ?? 0.85;
  }

  /**
   * Generate a query plan from the original query
   * This only plans - does NOT execute queries
   */
  async plan(originalQuery: string, complexityScore: number): Promise<QueryPlan> {
    if (!this.llmEngine) {
      // Fallback: simple single-query plan
      return {
        originalQuery,
        complexityScore,
        subqueries: [{
          text: originalQuery,
          priority: 1,
          groupId: 0,
          relevance: 1,
        }],
      };
    }

    // Determine number of sub-queries based on complexity
    const numSubqueries = Math.min(
      this.maxSubqueries,
      Math.max(2, Math.ceil(complexityScore * this.maxSubqueries)),
    );

    const prompt = `Break down this query into ${numSubqueries} focused sub-queries for vector search. Each sub-query should:
1. Target a specific aspect of the original query
2. Be concise and searchable (5-15 words)
3. Be independent enough for parallel execution
4. Cover different angles of the topic

Original query: "${originalQuery}"

Respond with ONLY a JSON array of strings, each string being a sub-query. No explanations, no markdown, just the array.
Example format: ["sub-query 1", "sub-query 2", "sub-query 3"]`;

    try {
      const result = await this.llmEngine.complete(prompt, {
        temperature: this.temperature,
        maxTokens: 200,
      });

      // Parse JSON response
      const cleaned = result.content.trim().replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
      let subqueryTexts: string[];
      
      try {
        subqueryTexts = JSON.parse(cleaned);
      } catch {
        // Fallback: try to extract array from text
        const arrayMatch = cleaned.match(/\[(.*?)\]/s);
        if (arrayMatch) {
          try {
            subqueryTexts = JSON.parse(arrayMatch[0]);
          } catch {
            // Last resort: split by lines or commas
            subqueryTexts = cleaned
              .split(/[,\n]/)
              .map(s => s.trim().replace(/^["']|["']$/g, ''))
              .filter(s => s.length > 0)
              .slice(0, this.maxSubqueries);
          }
        } else {
          // Fallback to single query
          subqueryTexts = [originalQuery];
        }
      }

      // Ensure we have at least one sub-query
      if (!Array.isArray(subqueryTexts) || subqueryTexts.length === 0) {
        subqueryTexts = [originalQuery];
      }

      // Limit to maxSubqueries
      subqueryTexts = subqueryTexts.slice(0, this.maxSubqueries);

      // Create sub-queries with priorities and groups
      const subqueries: SubQuery[] = subqueryTexts.map((text, index) => ({
        text: text.trim(),
        priority: subqueryTexts.length - index, // Earlier queries have higher priority
        groupId: 0, // All in same group for parallel execution
        relevance: 1 - (index * 0.1), // Decreasing relevance
      }));

      return {
        originalQuery,
        complexityScore,
        subqueries,
      };
    } catch (error) {
      // Fallback: single query plan
      return {
        originalQuery,
        complexityScore,
        subqueries: [{
          text: originalQuery,
          priority: 1,
          groupId: 0,
          relevance: 1,
        }],
      };
    }
  }
}
