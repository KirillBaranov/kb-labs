/**
 * Completeness Checker
 *
 * Checks if gathered chunks are sufficient to answer the query.
 * Can suggest additional searches if information is missing.
 */

import { useLogger } from '@kb-labs/sdk';
import type { ILLM } from '@kb-labs/sdk';
import type { MindChunk } from '@kb-labs/mind-types';
import type { AgentQueryMode } from '../types';
import { completeJSON } from '../llm/json';
import type { CompletenessResult, OrchestratorConfig } from '../types';
import { COMPLETENESS_SYSTEM_PROMPT, COMPLETENESS_PROMPT_TEMPLATE } from './prompts';

const getLogger = () => useLogger().child({ category: 'mind:orchestrator:checker' });

interface CompletenessResponse {
  complete: boolean;
  confidence: number;
  missing?: string[];
  suggestSources?: Array<{
    source: string;
    reason: string;
    query?: string;
  }>;
}

export interface CompletenessCheckerOptions {
  llm: ILLM;
  config: OrchestratorConfig;
}

/**
 * Completeness Checker - evaluates if context is sufficient
 */
export class CompletenessChecker {
  private readonly llm: ILLM;
  private readonly config: OrchestratorConfig;

  constructor(options: CompletenessCheckerOptions) {
    this.llm = options.llm;
    this.config = options.config;
  }

  /**
   * Check if chunks are sufficient for the query
   */
  async check(
    query: string,
    chunks: MindChunk[],
    mode: AgentQueryMode,
  ): Promise<CompletenessResult> {
    // Instant mode - skip LLM check, use heuristics
    if (mode === 'instant' || this.config.modes.instant.skipLLM) {
      return this.heuristicCheck(query, chunks);
    }

    // No chunks = not complete
    if (chunks.length === 0) {
      return {
        complete: false,
        confidence: 0,
        missing: ['No relevant code found'],
        sourcesChecked: [],
      };
    }

    // Build chunks summary for LLM
    const chunksSummary = this.buildChunksSummary(chunks);

    try {
      const prompt = COMPLETENESS_PROMPT_TEMPLATE
        .replace('{query}', query)
        .replace('{chunks_summary}', chunksSummary);

      const response = await completeJSON<CompletenessResponse>(this.llm, {
        prompt,
        systemPrompt: COMPLETENESS_SYSTEM_PROMPT,
        maxTokens: 500,
        temperature: 0.1,
      });

      return {
        complete: response.complete,
        confidence: Math.max(0, Math.min(1, response.confidence)),
        missing: response.missing,
        sourcesChecked: this.extractSourceTypes(chunks),
        suggestSources: response.suggestSources,
      };
    } catch (error) {
      // On LLM error, fall back to heuristics
      getLogger().warn('Completeness check LLM failed, using heuristics', { error });
      return this.heuristicCheck(query, chunks);
    }
  }

  /**
   * Heuristic-based completeness check (for instant mode)
   */
  private heuristicCheck(query: string, chunks: MindChunk[]): CompletenessResult {
    if (chunks.length === 0) {
      return {
        complete: false,
        confidence: 0,
        missing: ['No relevant code found'],
        sourcesChecked: [],
      };
    }

    // Calculate confidence based on:
    // 1. Number of chunks
    // 2. Average score
    // 3. Score spread
    const avgScore = chunks.reduce((sum, c) => sum + c.score, 0) / chunks.length;
    const topScore = chunks[0]?.score ?? 0;

    // More chunks and higher scores = more confidence
    let confidence = 0;

    // Base confidence from top score
    confidence += topScore * 0.4;

    // Bonus for average score
    confidence += avgScore * 0.3;

    // Bonus for number of relevant chunks (up to 5)
    const relevantChunks = chunks.filter(c => c.score > 0.5);
    confidence += Math.min(relevantChunks.length / 5, 1) * 0.3;

    // Clamp to 0-1
    confidence = Math.max(0, Math.min(1, confidence));

    // Mark as complete if confidence > 0.6 and has at least one good match
    const complete = confidence > 0.6 && topScore > 0.7;

    return {
      complete,
      confidence,
      sourcesChecked: this.extractSourceTypes(chunks),
      missing: complete ? undefined : ['May need more context'],
    };
  }

  /**
   * Build a summary of chunks for LLM
   */
  private buildChunksSummary(chunks: MindChunk[]): string {
    const maxChunksForSummary = 10;
    const maxTextLength = 500;

    return chunks
      .slice(0, maxChunksForSummary)
      .map((chunk, i) => {
        const text = chunk.text.length > maxTextLength
          ? chunk.text.slice(0, maxTextLength) + '...'
          : chunk.text;
        return `[${i + 1}] ${chunk.path} (lines ${chunk.span.startLine}-${chunk.span.endLine}, score: ${chunk.score.toFixed(2)}):\n${text}`;
      })
      .join('\n\n');
  }

  /**
   * Extract unique source types from chunks
   */
  private extractSourceTypes(chunks: MindChunk[]): string[] {
    const types = new Set<string>();

    for (const chunk of chunks) {
      if (chunk.path.startsWith('external://')) {
        const match = chunk.path.match(/external:\/\/([^/]+)/);
        if (match && match[1]) {
          types.add(match[1]);
        }
      } else {
        types.add('code');
      }
    }

    return Array.from(types);
  }
}

export function createCompletenessChecker(options: CompletenessCheckerOptions): CompletenessChecker {
  return new CompletenessChecker(options);
}
