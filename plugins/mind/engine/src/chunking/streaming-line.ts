/**
 * @module @kb-labs/mind-engine/chunking/streaming-line
 * Streaming line-based chunking for very large files
 *
 * This chunker processes files line-by-line without loading the entire file into memory.
 * Suitable for files >2MB where even regex-based chunking would be too memory-intensive.
 */

import * as fs from 'node:fs';
import * as readline from 'node:readline';
import type { Chunk, ChunkingOptions, Chunker } from './chunker';

export interface StreamingChunkingOptions extends ChunkingOptions {
  chunkLines?: number; // Number of lines per chunk
}

const DEFAULT_OPTIONS: Required<StreamingChunkingOptions> = {
  chunkLines: 100,
  maxLines: 150,
  minLines: 50,
  preserveContext: false, // Can't preserve context in streaming mode
};

/**
 * Streaming Line Chunker
 * Memory-efficient chunker for very large files (>2MB)
 * Processes files line-by-line without loading entire content into memory
 */
export class StreamingLineChunker implements Chunker {
  readonly id = 'streaming-line';
  readonly extensions = ['*']; // Supports all file types
  readonly languages = ['*']; // Language-agnostic

  chunk(sourceCode: string, filePath: string, options: ChunkingOptions = {}): Chunk[] {
    // For string input (already loaded), use simple line-based chunking
    // This is a fallback when called with string instead of file path
    const opts: Required<StreamingChunkingOptions> = {
      ...DEFAULT_OPTIONS,
      ...options,
    };

    const lines = sourceCode.split('\n');
    const chunks: Chunk[] = [];
    let start = 0;
    const chunkSize = opts.chunkLines || opts.maxLines;

    while (start < lines.length) {
      const end = Math.min(lines.length, start + chunkSize);
      const chunkLines = lines.slice(start, end);
      const text = chunkLines.join('\n');

      if (text.trim().length > 0) {
        chunks.push({
          text,
          span: {
            startLine: start + 1,
            endLine: end,
          },
          type: 'code-block',
          metadata: {
            chunkMethod: 'streaming-line',
            chunkSize,
          },
        });
      }

      start = end;
    }

    return chunks;
  }

  /**
   * Stream-based chunking (async generator)
   * For use when file path is known and file can be streamed
   */
  async *chunkStream(
    filePath: string,
    options: StreamingChunkingOptions = {},
  ): AsyncGenerator<Chunk> {
    const opts: Required<StreamingChunkingOptions> = {
      ...DEFAULT_OPTIONS,
      ...options,
    };

    const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let buffer: string[] = [];
    let lineNumber = 0;
    const chunkSize = opts.chunkLines || opts.maxLines;

    try {
      for await (const line of rl) {
        buffer.push(line);
        lineNumber++;

        if (buffer.length >= chunkSize) {
          const text = buffer.join('\n');
          const startLine = lineNumber - buffer.length + 1;

          yield {
            text,
            span: {
              startLine,
              endLine: lineNumber,
            },
            type: 'code-block',
            metadata: {
              chunkMethod: 'streaming-line',
              chunkSize,
            },
          };

          // Clear buffer immediately to free memory
          buffer = [];
        }
      }

      // Yield remaining lines
      if (buffer.length > 0) {
        const text = buffer.join('\n');
        const startLine = lineNumber - buffer.length + 1;

        yield {
          text,
          span: {
            startLine,
            endLine: lineNumber,
          },
          type: 'code-block',
          metadata: {
            chunkMethod: 'streaming-line',
            chunkSize,
            isLastChunk: true,
          },
        };
      }
    } finally {
      fileStream.close();
    }
  }

  /**
   * Helper to collect all chunks from stream into array
   * Use only for testing or small files
   */
  async chunkFromFile(filePath: string, options?: StreamingChunkingOptions): Promise<Chunk[]> {
    const chunks: Chunk[] = [];
    for await (const chunk of this.chunkStream(filePath, options)) {
      chunks.push(chunk);
    }
    return chunks;
  }
}
