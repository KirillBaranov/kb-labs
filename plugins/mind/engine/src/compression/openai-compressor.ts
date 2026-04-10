/**
 * @module @kb-labs/mind-engine/compression/openai-compressor
 * OpenAI-based LLM compression implementation
 */

import { useLogger, type ILLM } from '@kb-labs/sdk';
import type { KnowledgeChunk } from '../types/engine-contracts';
import type { LLMCompressor } from './llm-compressor';

const getCompressionLogger = () => useLogger().child({ category: 'mind:engine:compression' });

export interface OpenAICompressorOptions {
  /**
   * LLM to use for compression
   */
  llm: ILLM;

  /**
   * Maximum tokens for compressed output
   * Default: calculated from original length
   */
  maxTokens?: number;

  /**
   * Compression ratio (0-1)
   * 0.5 = compress to 50% of original
   * Default: 0.5
   */
  compressionRatio?: number;

  /**
   * Temperature for compression
   * Lower = more deterministic
   * Default: 0.2
   */
  temperature?: number;
}

/**
 * OpenAI-based LLM compressor
 * Compresses chunks using LLM while preserving meaning
 */
export class OpenAILLMCompressor implements LLMCompressor {
  private llm: ILLM;
  private compressionRatio: number;
  private temperature: number;

  constructor(options: OpenAICompressorOptions) {
    this.llm = options.llm;
    this.compressionRatio = options.compressionRatio ?? 0.5;
    this.temperature = options.temperature ?? 0.2;
  }

  async compress(chunk: KnowledgeChunk, query: string): Promise<string> {
    const originalText = chunk.text;
    const originalTokens = Math.ceil(originalText.length / 4);
    const targetTokens = Math.max(
      50, // Minimum tokens
      Math.floor(originalTokens * this.compressionRatio),
    );

    // Build compression prompt
    const prompt = this.buildCompressionPrompt(chunk, query, targetTokens);

    try {
      const result = await this.llm.complete(prompt, {
        maxTokens: targetTokens + 50, // Add buffer
        temperature: this.temperature,
      });

      return result.content.trim();
    } catch (error) {
      // Fallback to original text on error
      getCompressionLogger().warn(`LLM compression failed for chunk ${chunk.id}, using original text`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return originalText;
    }
  }

  async compressBatch(
    chunks: KnowledgeChunk[],
    query: string,
  ): Promise<string[]> {
    // Process in parallel for speed
    return Promise.all(
      chunks.map((chunk) => this.compress(chunk, query)),
    );
  }

  /**
   * Build compression prompt
   */
  private buildCompressionPrompt(
    chunk: KnowledgeChunk,
    query: string,
    targetTokens: number,
  ): string {
    const context = this.buildChunkContext(chunk);

    return `You are a code compression assistant. Compress the following code chunk while preserving all important information, function signatures, type definitions, and key logic.

Query context: "${query}"

Target: Compress to approximately ${targetTokens} tokens (about ${Math.floor(targetTokens * 4)} characters).

Original code:
\`\`\`
${chunk.text}
\`\`\`

${context}

Instructions:
1. Preserve all function signatures, class definitions, and type definitions
2. Keep critical logic and important comments
3. Remove redundant code, verbose comments, and unnecessary whitespace
4. Maintain code structure and readability
5. If the code is already concise, return it as-is

Compressed code:`;
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
}
