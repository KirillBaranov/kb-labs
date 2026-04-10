/**
 * @module @kb-labs/mind-engine/compression/summarizer
 * LLM-based summarization for chunks
 */

import type { ILLM } from '@kb-labs/sdk';
import type { KnowledgeChunk } from '../types/engine-contracts';

export interface SummarizerOptions {
  /**
   * LLM to use for summarization
   */
  llm: ILLM;

  /**
   * Maximum tokens for summary
   * Default: 150
   */
  maxTokens?: number;

  /**
   * Temperature for summarization
   * Default: 0.3
   */
  temperature?: number;
}

/**
 * Summarize a chunk using LLM
 */
export class ChunkSummarizer {
  private llm: ILLM;
  private maxTokens: number;
  private temperature: number;

  constructor(options: SummarizerOptions) {
    this.llm = options.llm;
    this.maxTokens = options.maxTokens ?? 150;
    this.temperature = options.temperature ?? 0.3;
  }

  /**
   * Summarize a single chunk
   */
  async summarize(chunk: KnowledgeChunk, query?: string): Promise<string> {
    const prompt = this.buildSummarizationPrompt(chunk, query);

    try {
      const result = await this.llm.complete(prompt, {
        maxTokens: this.maxTokens,
        temperature: this.temperature,
      });

      return result.content.trim();
    } catch (error) {
      // Fallback: extract first meaningful line or comment
      return this.extractFallbackSummary(chunk);
    }
  }

  /**
   * Summarize multiple chunks in batch
   */
  async summarizeBatch(
    chunks: KnowledgeChunk[],
    query?: string,
  ): Promise<string[]> {
    return Promise.all(
      chunks.map((chunk) => this.summarize(chunk, query)),
    );
  }

  /**
   * Build summarization prompt
   */
  private buildSummarizationPrompt(
    chunk: KnowledgeChunk,
    query?: string,
  ): string {
    const context = this.buildChunkContext(chunk);
    const queryContext = query ? `\nQuery: "${query}"\n` : '';

    return `Summarize the following code chunk in 1-3 sentences. Focus on what the code does, not implementation details.

${queryContext}${context}Code:
\`\`\`
${chunk.text}
\`\`\`

Summary:`;
  }

  /**
   * Build context information about the chunk
   */
  private buildChunkContext(chunk: KnowledgeChunk): string {
    const parts: string[] = [];

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
    }

    parts.push(`File: ${chunk.path}`);
    parts.push(`Lines: ${chunk.span.startLine}-${chunk.span.endLine}`);

    if (parts.length > 0) {
      return `Context:\n${parts.join('\n')}\n`;
    }

    return '';
  }

  /**
   * Extract fallback summary from chunk (when LLM fails)
   */
  private extractFallbackSummary(chunk: KnowledgeChunk): string {
    // Try to extract JSDoc comment
    const jsdocMatch = chunk.text.match(/\/\*\*[\s\S]*?\*\//);
    if (jsdocMatch) {
      const jsdoc = jsdocMatch[0]
        .replace(/\/\*\*|\*\//g, '')
        .replace(/\*\s*/g, '')
        .trim()
        .split('\n')[0]
        ?.trim();
      if (jsdoc && jsdoc.length < 200) {
        return jsdoc ?? '';
      }
    }

    // Try to extract single-line comment
    const commentMatch = chunk.text.match(/\/\/\s*(.+)/);
    if (commentMatch && commentMatch[1]) {
      return commentMatch[1].trim();
    }

    // Fallback: describe based on metadata
    const parts: string[] = [];
    if (chunk.metadata?.functionName) {
      parts.push(`Function: ${chunk.metadata.functionName}`);
    }
    if (chunk.metadata?.className) {
      parts.push(`Class: ${chunk.metadata.className}`);
    }
    if (parts.length > 0) {
      return parts.join(', ');
    }

    return `Code from ${chunk.path}:${chunk.span.startLine}-${chunk.span.endLine}`;
  }
}
