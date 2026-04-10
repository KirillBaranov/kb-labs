/**
 * Tree-sitter based chunker - Base class
 *
 * Provides AST-aware chunking that respects semantic boundaries.
 * Chunks never split functions, classes, or logical code blocks.
 *
 * Benefits over regex/line-based:
 * - Semantic boundaries (functions stay intact)
 * - Better context for embeddings
 * - Handles nested structures correctly
 * - Multi-language support through tree-sitter
 */

import * as fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { Chunker, Chunk, ChunkingOptions } from './chunker';
import { TreeSitterParser } from '../parsers/tree-sitter-parser';
import type { StatementBoundary } from '../parsers/language-parser';

export interface TreeSitterChunkerOptions {
  /**
   * Language for tree-sitter (typescript, javascript, python, etc.)
   */
  language: string;

  /**
   * File extensions this chunker supports
   */
  extensions: string[];

  /**
   * Chunker ID
   */
  id: string;
}

/**
 * Base class for tree-sitter chunkers
 * Implements streaming and AST-aware chunking
 */
export abstract class TreeSitterChunker implements Chunker {
  readonly id: string;
  readonly extensions: string[];
  readonly languages: string[];

  protected parser: TreeSitterParser;
  protected readonly defaultMaxLines = 120;
  protected readonly defaultMinLines = 10;

  constructor(options: TreeSitterChunkerOptions) {
    this.id = options.id;
    this.extensions = options.extensions;
    this.languages = [options.language];
    this.parser = new TreeSitterParser(options.language);
  }

  /**
   * Synchronous chunking (for small files only)
   * Throws error for large files to force streaming
   */
  chunk(sourceCode: string, filePath: string, options: ChunkingOptions = {}): Chunk[] {
    // Force streaming for files >100KB
    if (sourceCode.length > 100 * 1024) {
      throw new Error(
        `File ${filePath} is too large (${(sourceCode.length / 1024).toFixed(1)}KB). ` +
        `Use chunkStream() instead for memory safety.`
      );
    }

    const maxLines = options.maxLines ?? this.defaultMaxLines;
    const minLines = options.minLines ?? this.defaultMinLines;

    // Parse AST to find semantic boundaries
    const boundaries = this.parser.findStatementBoundaries(sourceCode);

    if (boundaries.length === 0) {
      // No AST available, fall back to line-based
      return this.chunkByLines(sourceCode, maxLines);
    }

    // Create chunks respecting semantic boundaries
    return this.createSemanticChunks(sourceCode, boundaries, maxLines, minLines);
  }

  /**
   * Streaming chunking (memory-efficient for large files)
   */
  async *chunkStream(filePath: string, options: ChunkingOptions = {}): AsyncGenerator<Chunk> {
    const maxLines = options.maxLines ?? this.defaultMaxLines;
    const minLines = options.minLines ?? this.defaultMinLines;

    // Check file size before reading
    // Tree-sitter requires full file content, which is a problem for huge files
    const stats = await fs.stat(filePath);
    const maxFileSize = 10 * 1024 * 1024; // 10MB limit for tree-sitter

    if (stats.size > maxFileSize) {
      // File too large for tree-sitter, fall back to streaming line-based
      yield* this.chunkStreamLines(filePath, maxLines);
      return;
    }

    // Read entire file for AST parsing
    // Note: Tree-sitter requires full file content
    // This is acceptable for files <10MB because:
    // 1. Tree-sitter is very memory efficient
    // 2. We immediately stream out chunks
    // 3. Most source files are <1MB
    const sourceCode = await fs.readFile(filePath, 'utf-8');

    // Parse AST
    const boundaries = this.parser.findStatementBoundaries(sourceCode);

    if (boundaries.length === 0) {
      // No AST, fall back to streaming line-based
      yield* this.chunkStreamLines(filePath, maxLines);
      return;
    }

    // Create semantic chunks and yield them one by one
    const chunks = this.createSemanticChunks(sourceCode, boundaries, maxLines, minLines);
    for (const chunk of chunks) {
      yield chunk;
    }
  }

  /**
   * Create semantic chunks respecting AST boundaries
   * Memory-efficient version that works without split('\n')
   */
  protected createSemanticChunks(
    sourceCode: string,
    boundaries: StatementBoundary[],
    maxLines: number,
    minLines: number
  ): Chunk[] {
    const chunks: Chunk[] = [];

    // Sort boundaries by start line
    const sortedBoundaries = [...boundaries].sort((a, b) => a.start - b.start);

    let currentChunk: {
      startLine: number;
      endLine: number;
      boundaries: StatementBoundary[];
    } | null = null;

    for (const boundary of sortedBoundaries) {
      const boundarySize = boundary.end - boundary.start + 1;

      // If this boundary is too large, split it
      if (boundarySize > maxLines) {
        // Flush current chunk first
        if (currentChunk && (currentChunk.endLine - currentChunk.startLine + 1) >= minLines) {
          chunks.push(this.createChunkNoSplit(sourceCode, currentChunk));
          currentChunk = null;
        }

        // Split large boundary into multiple chunks
        chunks.push(...this.splitLargeBoundaryNoSplit(sourceCode, boundary, maxLines));
        continue;
      }

      // Start new chunk if needed
      if (!currentChunk) {
        currentChunk = {
          startLine: boundary.start,
          endLine: boundary.end,
          boundaries: [boundary],
        };
        continue;
      }

      // Check if adding this boundary would exceed maxLines
      const potentialSize = (boundary.end - currentChunk.startLine + 1);
      if (potentialSize > maxLines && (currentChunk.endLine - currentChunk.startLine + 1) >= minLines) {
        // Flush current chunk
        chunks.push(this.createChunkNoSplit(sourceCode, currentChunk));

        // Start new chunk with this boundary
        currentChunk = {
          startLine: boundary.start,
          endLine: boundary.end,
          boundaries: [boundary],
        };
      } else {
        // Add boundary to current chunk
        currentChunk.boundaries.push(boundary);
        currentChunk.endLine = Math.max(currentChunk.endLine, boundary.end);
      }
    }

    // Flush remaining chunk
    if (currentChunk && (currentChunk.endLine - currentChunk.startLine + 1) >= minLines) {
      chunks.push(this.createChunkNoSplit(sourceCode, currentChunk));
    }

    return chunks;
  }

  /**
   * Extract lines from source code without split() - memory efficient
   * Finds line by counting newlines character-by-character
   */
  protected extractLines(sourceCode: string, startLine: number, endLine: number): string {
    let currentLine = 1;
    let startIdx = 0;
    let endIdx = sourceCode.length;

    // Find start position
    if (startLine > 1) {
      for (let i = 0; i < sourceCode.length; i++) {
        if (sourceCode[i] === '\n') {
          currentLine++;
          if (currentLine === startLine) {
            startIdx = i + 1;
            break;
          }
        }
      }
    }

    // Find end position
    if (endLine < Number.MAX_SAFE_INTEGER) {
      currentLine = 1;
      for (let i = 0; i < sourceCode.length; i++) {
        if (sourceCode[i] === '\n') {
          currentLine++;
          if (currentLine > endLine) {
            endIdx = i;
            break;
          }
        }
      }
    }

    return sourceCode.substring(startIdx, endIdx);
  }

  /**
   * Create chunk without split() - memory efficient version
   */
  protected createChunkNoSplit(
    sourceCode: string,
    data: {
      startLine: number;
      endLine: number;
      boundaries: StatementBoundary[];
    }
  ): Chunk {
    const text = this.extractLines(sourceCode, data.startLine, data.endLine);

    // Determine chunk type and name from boundaries
    const primaryBoundary = data.boundaries[0];
    const type = primaryBoundary?.type ?? 'code';
    const name = primaryBoundary?.name;

    return {
      text,
      span: { startLine: data.startLine, endLine: data.endLine },
      type,
      name,
      metadata: {
        boundaryCount: data.boundaries.length,
        semanticTypes: [...new Set(data.boundaries.map(b => b.type))],
      },
    };
  }

  /**
   * Split large boundary without split() - memory efficient version
   */
  protected splitLargeBoundaryNoSplit(
    sourceCode: string,
    boundary: StatementBoundary,
    maxLines: number
  ): Chunk[] {
    const chunks: Chunk[] = [];
    let currentStart = boundary.start;

    while (currentStart <= boundary.end) {
      const currentEnd = Math.min(currentStart + maxLines - 1, boundary.end);
      const text = this.extractLines(sourceCode, currentStart, currentEnd);

      chunks.push({
        text,
        span: { startLine: currentStart, endLine: currentEnd },
        type: boundary.type,
        name: boundary.name,
        metadata: {
          splitFromLarge: true,
          originalBoundary: {
            start: boundary.start,
            end: boundary.end,
          },
        },
      });

      currentStart = currentEnd + 1;
    }

    return chunks;
  }

  /**
   * Create chunk from accumulated data
   */
  protected createChunk(data: {
    lines: string[];
    startLine: number;
    boundaries: StatementBoundary[];
  }): Chunk {
    const text = data.lines.join('\n');
    const endLine = data.startLine + data.lines.length - 1;

    // Determine chunk type and name from boundaries
    const primaryBoundary = data.boundaries[0];
    const type = primaryBoundary?.type ?? 'code';
    const name = primaryBoundary?.name;

    return {
      text,
      span: { startLine: data.startLine, endLine },
      type,
      name,
      metadata: {
        boundaryCount: data.boundaries.length,
        semanticTypes: [...new Set(data.boundaries.map(b => b.type))],
      },
    };
  }

  /**
   * Split large boundary into multiple chunks
   */
  protected splitLargeBoundary(
    lines: string[],
    boundary: StatementBoundary,
    maxLines: number
  ): Chunk[] {
    const chunks: Chunk[] = [];
    let currentStart = boundary.start;

    while (currentStart <= boundary.end) {
      const currentEnd = Math.min(currentStart + maxLines - 1, boundary.end);
      const chunkLines = lines.slice(currentStart, currentEnd + 1);

      chunks.push({
        text: chunkLines.join('\n'),
        span: { startLine: currentStart, endLine: currentEnd },
        type: boundary.type,
        name: boundary.name,
        metadata: {
          splitFromLarge: true,
          originalBoundary: {
            start: boundary.start,
            end: boundary.end,
          },
        },
      });

      currentStart = currentEnd + 1;
    }

    return chunks;
  }

  /**
   * Fallback: chunk by lines (no semantic awareness)
   * Memory-efficient version without split()
   */
  protected chunkByLines(sourceCode: string, maxLines: number): Chunk[] {
    const chunks: Chunk[] = [];

    // Count total lines
    let totalLines = 1;
    for (let i = 0; i < sourceCode.length; i++) {
      if (sourceCode[i] === '\n') {totalLines++;}
    }

    // Create chunks without split
    for (let startLine = 1; startLine <= totalLines; startLine += maxLines) {
      const endLine = Math.min(startLine + maxLines - 1, totalLines);
      const text = this.extractLines(sourceCode, startLine, endLine);

      chunks.push({
        text,
        span: { startLine, endLine },
        type: 'code',
        metadata: { fallback: true },
      });
    }

    return chunks;
  }

  /**
   * Fallback: stream chunks by lines
   */
  protected async *chunkStreamLines(
    filePath: string,
    maxLines: number
  ): AsyncGenerator<Chunk> {
    const fileStream = createReadStream(filePath);
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let currentLines: string[] = [];
    let currentStartLine = 0;
    let lineNumber = 0;

    for await (const line of rl) {
      currentLines.push(line);

      if (currentLines.length >= maxLines) {
        yield {
          text: currentLines.join('\n'),
          span: { startLine: currentStartLine, endLine: lineNumber },
          type: 'code',
          metadata: { streaming: true, fallback: true },
        };

        currentLines = [];
        currentStartLine = lineNumber + 1;
      }

      lineNumber++;
    }

    // Yield remaining lines
    if (currentLines.length > 0) {
      yield {
        text: currentLines.join('\n'),
        span: { startLine: currentStartLine, endLine: lineNumber - 1 },
        type: 'code',
        metadata: { streaming: true, fallback: true },
      };
    }
  }
}
