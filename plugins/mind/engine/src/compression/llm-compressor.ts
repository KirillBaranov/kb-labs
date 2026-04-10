/**
 * @module @kb-labs/mind-engine/compression/llm-compressor
 * LLM-based compression for reducing token usage while preserving meaning
 */

import type { KnowledgeChunk } from '../types/engine-contracts';

/**
 * Interface for LLM-based compression
 */
export interface LLMCompressor {
  /**
   * Compress a single chunk
   */
  compress(chunk: KnowledgeChunk, query: string): Promise<string>;

  /**
   * Compress multiple chunks in batch
   */
  compressBatch(chunks: KnowledgeChunk[], query: string): Promise<string[]>;
}

/**
 * Null implementation that returns original text unchanged
 * Used as a placeholder until real LLM compression is implemented
 */
export class NullLLMCompressor implements LLMCompressor {
  async compress(chunk: KnowledgeChunk, _query: string): Promise<string> {
    // Simply return the original text unchanged
    return chunk.text;
  }

  async compressBatch(chunks: KnowledgeChunk[], _query: string): Promise<string[]> {
    // Return all original texts unchanged
    return chunks.map(chunk => chunk.text);
  }
}

