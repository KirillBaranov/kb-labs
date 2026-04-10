/**
 * @module @kb-labs/mind-engine/chunking/sliding-window
 * Sliding window helper for memory-efficient file processing
 *
 * Enables processing large files without loading entire content into memory
 * by using a sliding window approach with overlap for context preservation.
 */

import * as fs from 'node:fs';
import type { Chunk } from './chunker';

export interface SlidingWindowOptions {
  /**
   * Size of sliding window in bytes
   * Default: 50KB (reasonable for most code files)
   */
  windowSize?: number;

  /**
   * Overlap between windows to preserve context
   * Default: 5KB (enough to capture function boundaries)
   */
  overlap?: number;

  /**
   * High water mark for stream reading
   * Default: 8KB (Node.js default)
   */
  highWaterMark?: number;
}

const DEFAULT_OPTIONS: Required<SlidingWindowOptions> = {
  windowSize: 50 * 1024, // 50KB
  overlap: 5 * 1024, // 5KB
  highWaterMark: 8 * 1024, // 8KB
};

/**
 * Process file using sliding window approach
 *
 * @param filePath - Path to file to process
 * @param processor - Function to process each window and return chunks
 * @param options - Sliding window options
 * @returns AsyncGenerator of chunks with adjusted line numbers
 *
 * @example
 * ```typescript
 * for await (const chunk of slidingWindowStream(
 *   'large-file.ts',
 *   (window) => regexChunker.extractDeclarations(window)
 * )) {
 *   console.log(chunk);
 * }
 * ```
 */
export async function* slidingWindowStream(
  filePath: string,
  processor: (window: string, offsetLines: number) => Chunk[],
  options: SlidingWindowOptions = {},
): AsyncGenerator<Chunk> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  let buffer = '';
  let linesProcessed = 0;

  const stream = fs.createReadStream(filePath, {
    encoding: 'utf8',
    highWaterMark: opts.highWaterMark,
  });

  try {
    for await (const chunk of stream) {
      buffer += chunk;

      // Process full windows
      while (buffer.length >= opts.windowSize) {
        const window = buffer.slice(0, opts.windowSize);

        // Process window with provided processor
        const chunks = processor(window, linesProcessed);

        for (const c of chunks) {
          // Adjust spans to global line numbers
          yield {
            ...c,
            span: {
              startLine: c.span.startLine + linesProcessed,
              endLine: c.span.endLine + linesProcessed,
            },
          };
        }

        // Slide window with overlap
        const slideAmount = opts.windowSize - opts.overlap;
        const sliddenText = window.slice(0, slideAmount);
        buffer = buffer.slice(slideAmount);

        // Update lines processed - count newlines efficiently without split()
        let sliddenLines = 0;
        for (let i = 0; i < sliddenText.length; i++) {
          if (sliddenText[i] === '\n') {sliddenLines++;}
        }
        linesProcessed += sliddenLines;
      }
    }

    // Process remaining buffer
    if (buffer.length > 0) {
      const chunks = processor(buffer, linesProcessed);
      for (const c of chunks) {
        yield {
          ...c,
          span: {
            startLine: c.span.startLine + linesProcessed,
            endLine: c.span.endLine + linesProcessed,
          },
        };
      }
    }
  } finally {
    stream.destroy();
  }
}

/**
 * Helper to count lines in text efficiently
 */
export function countLines(text: string): number {
  let count = 1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {count++;}
  }
  return count;
}
