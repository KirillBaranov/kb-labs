/**
 * @module @kb-labs/mind-engine/chunking/line-based
 * Line-based chunker (fallback for unsupported languages)
 */

import type { Chunk, ChunkingOptions, Chunker } from './chunker';
import type { SpanRange } from '../types/engine-contracts';

/**
 * Line-based chunker (fallback for unsupported file types)
 */
export class LineBasedChunker implements Chunker {
  readonly id = 'line-based';
  readonly extensions: string[] = []; // Matches all if no other chunker found
  readonly languages?: string[] = undefined; // Matches all if no other chunker found

  chunk(sourceCode: string, filePath: string, options: ChunkingOptions = {}): Chunk[] {
    // DEPRECATED: This method should NEVER be called - use chunkStream() instead!
    throw new Error(`LineBasedChunker.chunk() called! This should use chunkStream() instead. File: ${filePath}`);

    const maxLines = options.maxLines ?? 120;
    const minLines = options.minLines ?? 40;
    const overlap = (options.overlap as number) ?? 20;

    const lines = sourceCode.split(/\r?\n/);
    const chunks: Chunk[] = [];
    let start = 0;

    while (start < lines.length) {
      const end = Math.min(lines.length, start + maxLines);
      const text = lines.slice(start, end).join('\n');

      if (text.trim().length > 0) {
        const span: SpanRange = {
          startLine: start + 1,
          endLine: end,
        };

        chunks.push({
          text,
          span,
          type: 'line-based',
          metadata: {
            chunkMethod: 'line-based',
            overlap: start > 0 ? overlap : 0,
          },
        });
      }

      if (end === lines.length) {
        break;
      }
      start = Math.max(0, end - overlap);
    }

    // Filter by minLines
    return chunks.filter(chunk => {
      const lines = chunk.text.split('\n').length;
      return lines >= minLines;
    });
  }

  /**
   * Stream-based chunking for line-based files
   * Processes files line-by-line without split()
   */
  async *chunkStream(filePath: string, options: ChunkingOptions = {}): AsyncGenerator<Chunk> {
    const maxLines = options.maxLines ?? 120;
    const minLines = options.minLines ?? 40;
    const overlap = (options.overlap as number) ?? 20;

    const fs = await import('node:fs');
    const readline = await import('node:readline');

    const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let buffer: string[] = [];
    let lineNum = 0;
    let chunkStartLine = 1;

    try {
      for await (const line of rl) {
        lineNum++;
        buffer.push(line);

        // When buffer reaches maxLines, yield a chunk
        if (buffer.length >= maxLines) {
          const text = buffer.join('\n');
          if (text.trim().length > 0 && buffer.length >= minLines) {
            yield {
              text,
              span: {
                startLine: chunkStartLine,
                endLine: lineNum,
              },
              type: 'line-based',
              metadata: {
                chunkMethod: 'line-based-streaming',
                overlap: chunkStartLine > 1 ? overlap : 0,
              },
            };
          }

          // Keep overlap lines for context
          buffer = buffer.slice(-overlap);
          chunkStartLine = lineNum - overlap + 1;
        }
      }

      // Yield final chunk if any remaining lines
      if (buffer.length >= minLines) {
        const text = buffer.join('\n');
        if (text.trim().length > 0) {
          yield {
            text,
            span: {
              startLine: chunkStartLine,
              endLine: lineNum,
            },
            type: 'line-based',
            metadata: {
              chunkMethod: 'line-based-streaming',
              overlap: chunkStartLine > 1 ? overlap : 0,
              isLastChunk: true,
            },
          };
        }
      }
    } finally {
      fileStream.close();
    }
  }
}





