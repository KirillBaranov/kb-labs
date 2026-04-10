/**
 * Response Synthesizer
 *
 * Synthesizes an agent-friendly response from chunks and query.
 * Includes anti-hallucination verification.
 */

import { useLogger } from '@kb-labs/sdk';
import type { ILLM } from '@kb-labs/sdk';
import type { MindChunk } from '@kb-labs/mind-types';
import type { AgentQueryMode, AgentSource, AgentSourceKind, AgentWarning } from '../types';
import { completeJSON } from '../llm/json';
import type { SynthesisResult, OrchestratorConfig } from '../types';
import {
  SYNTHESIS_SYSTEM_PROMPT,
  SYNTHESIS_PROMPT_TEMPLATE,
  INSTANT_SYNTHESIS_TEMPLATE,
} from './prompts';
import { createSourceVerifier } from '../verification/index';
import { createFieldChecker } from '../verification/index';
import { arrayToToon } from '../utils/toon';

const getLogger = () => useLogger().child({ category: 'mind:orchestrator:synthesizer' });

interface SynthesisResponse {
  answer: string;
  sources?: Array<{
    file: string;
    lines: [number, number];
    snippet: string;
    relevance: string;
    kind?: string;
  }>;
  confidence: number;
  complete?: boolean;
  suggestions?: Array<{
    type: string;
    label: string;
    ref: string;
  }>;
}

interface InstantSynthesisResponse {
  answer: string;
  confidence: number;
}

export interface ResponseSynthesizerOptions {
  llm: ILLM;
  config: OrchestratorConfig;
}

/**
 * Response Synthesizer - creates agent-friendly responses
 */
export class ResponseSynthesizer {
  private readonly llm: ILLM;
  private readonly config: OrchestratorConfig;

  constructor(options: ResponseSynthesizerOptions) {
    this.llm = options.llm;
    this.config = options.config;
  }

  /**
   * Synthesize response from chunks
   */
  async synthesize(
    query: string,
    chunks: MindChunk[],
    mode: AgentQueryMode,
  ): Promise<SynthesisResult> {
    // No chunks = no answer
    if (chunks.length === 0) {
      return {
        answer: this.getNoResultsMessage(query),
        sources: [],
        confidence: 0,
        complete: false,
        suggestions: [
          {
            type: 'next-question',
            label: 'Try a different search term',
            ref: query,
          },
        ],
      };
    }

    // Instant mode - simple answer without LLM or with minimal LLM
    if (mode === 'instant') {
      return this.synthesizeInstant(query, chunks);
    }

    // Full synthesis for auto/thinking modes
    return this.synthesizeFull(query, chunks, mode);
  }

  /**
   * Instant mode synthesis - fast, minimal LLM usage
   */
  private async synthesizeInstant(
    query: string,
    chunks: MindChunk[],
  ): Promise<SynthesisResult> {
    // For simple instant mode, build answer from chunks without LLM
    if (this.config.modes.instant.skipLLM) {
      return this.buildDirectAnswer(query, chunks);
    }

    // Optional: Use LLM for brief answer
    try {
      const chunksText = this.formatChunksForLLM(chunks, 3);
      const prompt = INSTANT_SYNTHESIS_TEMPLATE
        .replace('{query}', query)
        .replace('{chunks}', chunksText);

      const response = await completeJSON<InstantSynthesisResponse>(this.llm, {
        prompt,
        maxTokens: 200,
        temperature: 0.1,
      });

      return {
        answer: response.answer,
        sources: this.chunksToSources(chunks.slice(0, 3)),
        confidence: response.confidence,
        complete: response.confidence > 0.7,
      };
    } catch {
      return this.buildDirectAnswer(query, chunks);
    }
  }

  /**
   * Full synthesis with LLM
   */
  private async synthesizeFull(
    query: string,
    chunks: MindChunk[],
    mode: AgentQueryMode,
  ): Promise<SynthesisResult> {
    const maxChunks = mode === 'thinking'
      ? this.config.modes.thinking.chunksPerQuery
      : this.config.modes.auto.chunksPerQuery;

    const chunksText = this.formatChunksForLLM(chunks, maxChunks);

    try {
      const prompt = SYNTHESIS_PROMPT_TEMPLATE
        .replace('{query}', query)
        .replace('{chunks}', chunksText);

      const response = await completeJSON<SynthesisResponse>(this.llm, {
        prompt,
        systemPrompt: SYNTHESIS_SYSTEM_PROMPT,
        maxTokens: mode === 'thinking' ? 2000 : 1000,
        temperature: 0.2,
      });

      // Convert response sources to AgentSource format
      const sources: AgentSource[] = (response.sources ?? []).map(s => ({
        file: s.file,
        lines: s.lines,
        snippet: s.snippet,
        relevance: s.relevance,
        kind: this.parseSourceKind(s.kind, s.file),
      }));

      // If LLM didn't return sources, use chunks
      if (sources.length === 0) {
        sources.push(...this.chunksToSources(chunks.slice(0, 5)));
      }

      // Anti-hallucination verification
      const warnings: AgentWarning[] = [];
      let adjustedConfidence = Math.max(0, Math.min(1, response.confidence));

      // Verify sources exist in chunks
      const sourceVerifier = createSourceVerifier();
      const sourceVerification = sourceVerifier.verifyAll(sources, chunks, adjustedConfidence);
      warnings.push(...sourceVerification.warnings);
      adjustedConfidence = sourceVerification.adjustedConfidence;

      // Verify mentioned fields exist in source code
      const fieldChecker = createFieldChecker();
      const fieldCheck = fieldChecker.check(response.answer, chunks);
      warnings.push(...fieldCheck.warnings);

      // Adjust confidence based on field verification
      if (fieldCheck.confidence < 1) {
        adjustedConfidence *= fieldCheck.confidence;
      }

      // Add low confidence warning if needed
      if (adjustedConfidence < 0.5) {
        warnings.push({
          code: 'LOW_CONFIDENCE',
          message: `Answer confidence is low (${(adjustedConfidence * 100).toFixed(0)}%). Some claims may not be fully supported by sources.`,
        });
      }

      return {
        answer: response.answer,
        sources,
        confidence: adjustedConfidence,
        complete: response.complete ?? adjustedConfidence > 0.7,
        suggestions: response.suggestions?.map(s => ({
          type: s.type as any,
          label: s.label,
          ref: s.ref,
        })),
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      // On error, fall back to direct answer
      getLogger().warn('Synthesis LLM failed, using direct answer', { error });
      return this.buildDirectAnswer(query, chunks);
    }
  }

  /**
   * Build direct answer without LLM
   */
  private buildDirectAnswer(query: string, chunks: MindChunk[]): SynthesisResult {
    const topChunk = chunks[0];
    if (!topChunk) {
      return {
        answer: this.getNoResultsMessage(query),
        sources: [],
        confidence: 0,
        complete: false,
      };
    }

    // Build simple answer from top chunks
    const answer = chunks.length === 1
      ? `Found in ${topChunk.path} (lines ${topChunk.span.startLine}-${topChunk.span.endLine})`
      : `Found ${chunks.length} relevant matches. Top result: ${topChunk.path} (lines ${topChunk.span.startLine}-${topChunk.span.endLine})`;

    return {
      answer,
      sources: this.chunksToSources(chunks.slice(0, 5)),
      confidence: topChunk.score,
      complete: topChunk.score > 0.8,
    };
  }

  /**
   * Convert chunks to AgentSource format
   */
  private chunksToSources(chunks: MindChunk[]): AgentSource[] {
    return chunks.map(chunk => ({
      file: chunk.path,
      lines: [chunk.span.startLine, chunk.span.endLine] as [number, number],
      snippet: this.truncateSnippet(chunk.text, this.config.synthesis.snippetMaxLines),
      relevance: `Score: ${chunk.score.toFixed(2)}`,
      kind: this.inferSourceKind(chunk),
    }));
  }

  /**
   * Format chunks for LLM prompt using TOON format
   * TOON provides compact tabular format for structured data
   */
  private formatChunksForLLM(chunks: MindChunk[], maxChunks: number): string {
    const selectedChunks = chunks.slice(0, maxChunks);

    // Convert chunks to TOON-friendly format
    const chunkData = selectedChunks.map((chunk, i) => ({
      id: i + 1,
      path: chunk.path,
      lines: `${chunk.span.startLine}-${chunk.span.endLine}`,
      score: chunk.score.toFixed(2),
      text: this.truncateSnippet(chunk.text, 50), // Keep original 50 lines for quality
    }));

    return arrayToToon(chunkData, ['id', 'path', 'lines', 'score', 'text']);
  }

  /**
   * Truncate snippet to max lines
   */
  private truncateSnippet(text: string, maxLines: number): string {
    const lines = text.split('\n');
    if (lines.length <= maxLines) {
      return text;
    }
    return lines.slice(0, maxLines).join('\n') + '\n...';
  }

  /**
   * Infer source kind from chunk
   */
  private inferSourceKind(chunk: MindChunk): AgentSourceKind {
    const path = chunk.path.toLowerCase();

    if (path.startsWith('external://')) {
      return 'external';
    }
    if (path.includes('/adr/') || path.includes('/docs/adr/')) {
      return 'adr';
    }
    if (path.endsWith('.md') || path.includes('/docs/')) {
      return 'doc';
    }
    if (path.includes('config') || path.endsWith('.json') || path.endsWith('.yaml') || path.endsWith('.yml')) {
      return 'config';
    }
    return 'code';
  }

  /**
   * Parse source kind from string
   */
  private parseSourceKind(kind: string | undefined, file: string): AgentSourceKind {
    if (!kind) {
      return this.inferSourceKind({ path: file } as MindChunk);
    }

    const validKinds: AgentSourceKind[] = ['code', 'doc', 'adr', 'config', 'external'];
    if (validKinds.includes(kind as AgentSourceKind)) {
      return kind as AgentSourceKind;
    }
    return 'code';
  }

  /**
   * Get appropriate "no results" message
   */
  private getNoResultsMessage(query: string): string {
    // Detect language
    const isRussian = /[а-яА-ЯёЁ]/.test(query);
    return isRussian
      ? 'В индексированной кодовой базе не найдено релевантной информации.'
      : 'No relevant information found in the indexed codebase.';
  }
}

export function createResponseSynthesizer(options: ResponseSynthesizerOptions): ResponseSynthesizer {
  return new ResponseSynthesizer(options);
}
