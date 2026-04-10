/**
 * Query Decomposer
 *
 * Breaks complex queries into focused sub-queries for better search results.
 */

import type { ILLM } from '@kb-labs/sdk';
import type { AgentQueryMode } from '../types';
import { completeJSON } from '../llm/json';
import type { DecomposedQuery, QueryComplexity, OrchestratorConfig } from '../types';
import {
  DECOMPOSE_SYSTEM_PROMPT,
  DECOMPOSE_PROMPT_TEMPLATE,
  COMPLEXITY_SYSTEM_PROMPT,
  COMPLEXITY_PROMPT_TEMPLATE,
} from './prompts';

interface DecomposeResponse {
  subqueries: string[];
  reasoning?: string;
}

interface ComplexityResponse {
  level: 'simple' | 'medium' | 'complex';
  reason: string;
}

export interface QueryDecomposerOptions {
  llm: ILLM;
  config: OrchestratorConfig;
}

/**
 * Query Decomposer - breaks down complex queries
 */
export class QueryDecomposer {
  private readonly llm: ILLM;
  private readonly config: OrchestratorConfig;

  constructor(options: QueryDecomposerOptions) {
    this.llm = options.llm;
    this.config = options.config;
  }

  /**
   * Detect query complexity using heuristics and optionally LLM
   */
  async detectComplexity(query: string): Promise<QueryComplexity> {
    // Quick heuristics first
    const heuristic = this.heuristicComplexity(query);
    if (heuristic?.level === 'simple' && heuristic.suggestedMode === 'instant') {
      return heuristic;
    }
    if (heuristic && !this.config.autoDetectComplexity) {
      return heuristic;
    }

    // For auto mode, use LLM for better detection
    if (this.config.autoDetectComplexity && this.config.mode === 'auto') {
      try {
        const prompt = COMPLEXITY_PROMPT_TEMPLATE.replace('{query}', query);
        const response = await completeJSON<ComplexityResponse>(this.llm, {
          prompt,
          systemPrompt: COMPLEXITY_SYSTEM_PROMPT,
          maxTokens: 200,
          temperature: 0.1,
        });

        const modeMap: Record<string, AgentQueryMode> = {
          simple: 'instant',
          medium: 'auto',
          complex: 'thinking',
        };

        return {
          level: response.level,
          reason: response.reason,
          suggestedMode: modeMap[response.level] ?? 'auto',
        };
      } catch {
        // Fall back to heuristics on error
        return heuristic ?? { level: 'medium', reason: 'Default', suggestedMode: 'auto' };
      }
    }

    return heuristic ?? { level: 'medium', reason: 'Default', suggestedMode: 'auto' };
  }

  /**
   * Decompose a query into sub-queries
   */
  async decompose(query: string, mode: AgentQueryMode): Promise<DecomposedQuery> {
    // Instant mode - no decomposition
    if (mode === 'instant') {
      return {
        original: query,
        subqueries: [query],
      };
    }

    // Check if decomposition is needed
    const complexity = await this.detectComplexity(query);
    if (complexity.level === 'simple') {
      return {
        original: query,
        subqueries: [query],
        reasoning: 'Simple query - no decomposition needed',
      };
    }

    // Determine max subqueries based on mode
    const maxSubqueries = mode === 'thinking'
      ? this.config.modes.thinking.maxSubqueries
      : this.config.modes.auto.maxSubqueries;

    try {
      const prompt = DECOMPOSE_PROMPT_TEMPLATE.replace('{query}', query);
      const response = await completeJSON<DecomposeResponse>(this.llm, {
        prompt,
        systemPrompt: DECOMPOSE_SYSTEM_PROMPT,
        maxTokens: 500,
        temperature: 0.2,
      });

      // Limit and clean subqueries
      const cleanedSubqueries = response.subqueries
        .map(q => q.trim())
        .filter(q => q.length > 0);

      // Always include original query to preserve exact identifiers/symbols.
      // LLM decomposition can paraphrase technical tokens and hurt retrieval.
      const subqueries = this.buildSubqueriesWithOriginal(
        query,
        cleanedSubqueries,
        maxSubqueries,
      );

      return {
        original: query,
        subqueries,
        reasoning: response.reasoning,
      };
    } catch (error) {
      // On error, return original query
      return {
        original: query,
        subqueries: [query],
        reasoning: `Decomposition failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Heuristic-based complexity detection
   */
  private heuristicComplexity(query: string): QueryComplexity | null {
    const lowerQuery = query.toLowerCase();
    const wordCount = query.split(/\s+/).length;
    const hasIdentifier = /`[^`]+`/.test(query) || /\b[A-Z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*\b/.test(query);
    const technicalLookupLike = /\b(interface|method|methods|function|class|field|config|policy|option|parameter|stage)\b/i.test(query);
    const debugLookupLike = /\b(error|exception|invalid|failed|failure|null|undefined)\b/i.test(query);

    // Deterministic fast path for short technical/debug lookups:
    // skip decomposition to preserve exact lexical evidence.
    if (wordCount <= 12 && (hasIdentifier || technicalLookupLike || debugLookupLike)) {
      return {
        level: 'simple',
        reason: 'Short technical lookup query',
        suggestedMode: 'instant',
      };
    }

    // Simple patterns
    const simplePatterns = [
      /^где\s+(находится|лежит|расположен)/i,
      /^where\s+(is|are|can\s+i\s+find)/i,
      /^what\s+is\s+(?:the\s+)?[A-Z][a-zA-Z0-9]+(?:\s+(?:interface|class|method|function|field|config|option|parameter|policy|methods?))?/i,
      /^what\s+is\s+the\s+(path|location|file)/i,
      /^найти?\s+(файл|класс|функцию)/i,
      /^find\s+(the\s+)?(file|class|function|method)/i,
    ];

    for (const pattern of simplePatterns) {
      if (pattern.test(query)) {
        return {
          level: 'simple',
          reason: 'Location/lookup query',
          suggestedMode: 'instant',
        };
      }
    }

    // Complex patterns
    const complexPatterns = [
      /как\s+связан[ыо]?\s/i,
      /объясни.*архитектур/i,
      /how\s+(are|is).*connected/i,
      /explain.*architecture/i,
      /взаимодействи[яе]\s+между/i,
      /flow\s+of/i,
      /relationship\s+between/i,
    ];

    for (const pattern of complexPatterns) {
      if (pattern.test(query)) {
        return {
          level: 'complex',
          reason: 'Architecture/relationship query',
          suggestedMode: 'thinking',
        };
      }
    }

    // Word count heuristics
    if (wordCount <= 5) {
      return {
        level: 'simple',
        reason: 'Short query',
        suggestedMode: 'instant',
      };
    }

    if (wordCount >= 15) {
      return {
        level: 'complex',
        reason: 'Long detailed query',
        suggestedMode: 'thinking',
      };
    }

    // Default to medium
    return {
      level: 'medium',
      reason: 'Standard complexity',
      suggestedMode: 'auto',
    };
  }

  private buildSubqueriesWithOriginal(
    originalQuery: string,
    generated: string[],
    maxSubqueries: number,
  ): string[] {
    const deduped: string[] = [];
    const normalizedOriginal = normalizeQueryForDedup(originalQuery);
    const generatedWithoutOriginal: string[] = [];

    for (const candidate of generated) {
      const normalized = normalizeQueryForDedup(candidate);
      if (!normalized || normalized === normalizedOriginal) {
        continue;
      }
      if (!generatedWithoutOriginal.some(item => normalizeQueryForDedup(item) === normalized)) {
        generatedWithoutOriginal.push(candidate);
      }
    }

    deduped.push(originalQuery);
    for (const candidate of generatedWithoutOriginal) {
      if (deduped.length >= maxSubqueries) {
        break;
      }
      deduped.push(candidate);
    }

    return deduped;
  }
}

function normalizeQueryForDedup(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function createQueryDecomposer(options: QueryDecomposerOptions): QueryDecomposer {
  return new QueryDecomposer(options);
}
