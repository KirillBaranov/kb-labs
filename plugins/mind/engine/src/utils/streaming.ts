/**
 * Streaming utilities for memory-efficient text processing
 *
 * These utilities prevent OOM errors by processing text line-by-line
 * instead of loading entire files into memory with split('\n')
 */

import { Readable } from 'stream';
import { createInterface } from 'readline';

/**
 * Read lines from a Node.js Readable stream
 * Memory-efficient alternative to content.split('\n')
 *
 * @example
 * ```typescript
 * const stream = fs.createReadStream('large-file.txt', 'utf8');
 * for await (const line of readLines(stream)) {
 *   console.log(line);
 * }
 * ```
 */
export async function* readLines(stream: Readable): AsyncGenerator<string, void, undefined> {
  const rl = createInterface({
    input: stream,
    crlfDelay: Infinity, // Treat \r\n as single line break
  });

  try {
    for await (const line of rl) {
      yield line;
    }
  } finally {
    rl.close();
  }
}

/**
 * Read lines from a string without split()
 * More memory-efficient for large strings
 *
 * @example
 * ```typescript
 * const content = "line1\nline2\nline3";
 * for await (const line of readLinesFromString(content)) {
 *   console.log(line);
 * }
 * ```
 */
export async function* readLinesFromString(content: string): AsyncGenerator<string, void, undefined> {
  let start = 0;
  let end = 0;

  while (end < content.length) {
    // Find next newline
    end = content.indexOf('\n', start);

    if (end === -1) {
      // Last line (no trailing newline)
      if (start < content.length) {
        yield content.slice(start);
      }
      break;
    }

    // Yield line without newline
    yield content.slice(start, end);
    start = end + 1;
  }
}

/**
 * Split stream by delimiter without loading full content
 * Generalizes readLines to any delimiter
 *
 * @example
 * ```typescript
 * const stream = fs.createReadStream('data.csv', 'utf8');
 * for await (const row of splitStream(stream, ',')) {
 *   console.log(row);
 * }
 * ```
 */
export async function* splitStream(
  stream: Readable,
  delimiter: string
): AsyncGenerator<string, void, undefined> {
  let buffer = '';
  const decoder = new TextDecoder();

  for await (const chunk of stream) {
    // Handle both Buffer and string chunks
    const text = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
    buffer += text;

    // Split by delimiter
    const parts = buffer.split(delimiter);

    // Keep last part in buffer (might be incomplete)
    buffer = parts.pop() || '';

    // Yield complete parts
    for (const part of parts) {
      yield part;
    }
  }

  // Yield remaining buffer
  if (buffer.length > 0) {
    yield buffer;
  }
}

/**
 * Count lines in a stream without loading into memory
 * Useful for progress tracking
 *
 * @example
 * ```typescript
 * const stream = fs.createReadStream('file.txt', 'utf8');
 * const lineCount = await countLines(stream);
 * console.log(`File has ${lineCount} lines`);
 * ```
 */
export async function countLines(stream: Readable): Promise<number> {
  let count = 0;
  for await (const _line of readLines(stream)) {
    count++;
  }
  return count;
}

/**
 * Read lines in batches for efficient processing
 *
 * @example
 * ```typescript
 * const stream = fs.createReadStream('file.txt', 'utf8');
 * for await (const batch of readLinesBatched(stream, 100)) {
 *   // Process 100 lines at once
 *   await processBatch(batch);
 * }
 * ```
 */
export async function* readLinesBatched(
  stream: Readable,
  batchSize: number
): AsyncGenerator<string[], void, undefined> {
  let batch: string[] = [];

  for await (const line of readLines(stream)) {
    batch.push(line);

    if (batch.length >= batchSize) {
      yield batch;
      batch = [];
    }
  }

  // Yield remaining lines
  if (batch.length > 0) {
    yield batch;
  }
}

/**
 * Create a Readable stream from a string
 * Useful for testing and compatibility
 */
export function stringToStream(content: string): Readable {
  return Readable.from([content]);
}

/**
 * Read entire stream to string (only for small streams!)
 * This is the opposite of streaming - use with caution
 */
export async function streamToString(stream: Readable): Promise<string> {
  const chunks: string[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
  }
  return chunks.join('');
}

/**
 * Transform stream line-by-line with a mapper function
 *
 * @example
 * ```typescript
 * const stream = fs.createReadStream('file.txt', 'utf8');
 * const uppercased = mapLines(stream, line => line.toUpperCase());
 * for await (const line of uppercased) {
 *   console.log(line);
 * }
 * ```
 */
export async function* mapLines<T>(
  stream: Readable,
  mapper: (line: string, index: number) => T | Promise<T>
): AsyncGenerator<T, void, undefined> {
  let index = 0;
  for await (const line of readLines(stream)) {
    yield await mapper(line, index++);
  }
}

/**
 * Filter stream lines with a predicate
 *
 * @example
 * ```typescript
 * const stream = fs.createReadStream('file.txt', 'utf8');
 * const nonEmpty = filterLines(stream, line => line.trim().length > 0);
 * for await (const line of nonEmpty) {
 *   console.log(line);
 * }
 * ```
 */
export async function* filterLines(
  stream: Readable,
  predicate: (line: string, index: number) => boolean | Promise<boolean>
): AsyncGenerator<string, void, undefined> {
  let index = 0;
  for await (const line of readLines(stream)) {
    if (await predicate(line, index++)) {
      yield line;
    }
  }
}
