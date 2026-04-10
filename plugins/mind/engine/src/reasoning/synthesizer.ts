import type { KnowledgeResult, KnowledgeChunk } from '../types/engine-contracts';
import type { ILLM } from '@kb-labs/sdk';

export interface ResultSynthesizerOptions {
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
   * LLM model to use
   * Default: 'gpt-4o-mini'
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
}

export interface SynthesisResult {
  /**
   * Synthesized context text
   */
  contextText: string;
  
  /**
   * Deduplicated chunks used
   */
  chunks: KnowledgeChunk[];
  
  /**
   * Number of chunks before deduplication
   */
  originalChunkCount: number;
  
  /**
   * Number of chunks after deduplication
   */
  deduplicatedChunkCount: number;
}

export class ResultSynthesizer {
  private readonly enabled: boolean;
  private readonly deduplication: boolean;
  private readonly maxTokens: number;
  private readonly llmEngine: ILLM | null;
  private readonly model: string;
  private readonly temperature: number;
  private readonly progressiveRefinement: boolean;

  constructor(
    options: ResultSynthesizerOptions,
    llmEngine: ILLM | null,
  ) {
    this.enabled = options.enabled ?? true;
    this.deduplication = options.deduplication ?? true;
    this.maxTokens = options.maxTokens ?? 4000;
    this.llmEngine = llmEngine;
    this.model = options.model ?? 'gpt-4o-mini';
    this.temperature = options.temperature ?? 0.2;
    this.progressiveRefinement = options.progressiveRefinement ?? true;
  }

  /**
   * Synthesize multiple KnowledgeResult into a single context
   */
  async synthesize(
    results: KnowledgeResult[],
    originalQuery: string,
  ): Promise<SynthesisResult> {
    // Collect all chunks from all results
    const allChunks: KnowledgeChunk[] = [];
    for (const result of results) {
      allChunks.push(...result.chunks);
    }

    const originalChunkCount = allChunks.length;

    // Deduplicate chunks
    const deduplicatedChunks = this.deduplication
      ? this.deduplicateChunks(allChunks)
      : allChunks;

    const deduplicatedChunkCount = deduplicatedChunks.length;

    // Sort by score (descending)
    deduplicatedChunks.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    if (!this.enabled || !this.llmEngine) {
      // Fallback: simple concatenation
      const contextText = deduplicatedChunks
        .map(chunk => this.formatChunk(chunk))
        .join('\n\n---\n\n');
      
      return {
        contextText,
        chunks: deduplicatedChunks,
        originalChunkCount,
        deduplicatedChunkCount,
      };
    }

    // Use LLM to synthesize
    const contextText = await this.llmSynthesize(
      deduplicatedChunks,
      originalQuery,
    );

    return {
      contextText,
      chunks: deduplicatedChunks,
      originalChunkCount,
      deduplicatedChunkCount,
    };
  }

  /**
   * Deduplicate chunks by chunkId and text similarity
   */
  private deduplicateChunks(chunks: KnowledgeChunk[]): KnowledgeChunk[] {
    const seen = new Set<string>();
    const deduplicated: KnowledgeChunk[] = [];

    for (const chunk of chunks) {
      const chunkId = chunk.id ?? chunk.chunkId ?? `${chunk.path}:${chunk.span.startLine}-${chunk.span.endLine}`;
      // Check by chunkId first
      if (seen.has(chunkId)) {
        continue;
      }

      // Check text similarity (simple approach: exact match or very high similarity)
      let isDuplicate = false;
      for (const existing of deduplicated) {
        const similarity = this.textSimilarity(chunk.text, existing.text);
        if (similarity > 0.95) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        seen.add(chunkId);
        deduplicated.push(chunk);
      }
    }

    return deduplicated;
  }

  /**
   * Simple text similarity (Jaccard similarity on words)
   */
  private textSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Format a chunk for synthesis
   */
  private formatChunk(chunk: KnowledgeChunk): string {
    const parts: string[] = [];
    
    if (chunk.path) {
      parts.push(`Path: ${chunk.path}`);
    }
    
    if (chunk.span) {
      parts.push(`Lines: ${chunk.span.startLine}-${chunk.span.endLine}`);
    }
    
    if (chunk.score !== undefined) {
      parts.push(`Score: ${chunk.score.toFixed(3)}`);
    }
    
    parts.push(`\n${chunk.text}`);
    
    return parts.join('\n');
  }

  /**
   * Use LLM to synthesize chunks into coherent context
   */
  private async llmSynthesize(
    chunks: KnowledgeChunk[],
    originalQuery: string,
  ): Promise<string> {
    if (!this.llmEngine) {
      throw new Error('LLM engine not available for synthesis');
    }

    // Format chunks for LLM
    const chunksText = chunks
      .slice(0, 20) // Limit to top 20 chunks to avoid token limits
      .map(chunk => this.formatChunk(chunk))
      .join('\n\n---\n\n');

    const prompt = `You are synthesizing search results into a coherent context to answer this query: "${originalQuery}"

Search results:
${chunksText}

Synthesize these results into a clear, well-organized context that directly addresses the query. 
- Preserve important code examples and technical details
- Remove redundancy and duplicates
- Maintain logical flow
- Keep file paths and line numbers for reference
- Focus on the most relevant information

Respond with ONLY the synthesized context, no explanations or meta-commentary.`;

    try {
      const result = await this.llmEngine.complete(prompt, {
        temperature: this.temperature,
        maxTokens: this.maxTokens,
      });

      return result.content.trim();
    } catch (error) {
      // Fallback to simple concatenation if LLM fails
      return chunks
        .map(chunk => this.formatChunk(chunk))
        .join('\n\n---\n\n');
    }
  }
}
