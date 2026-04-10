/**
 * @module @kb-labs/mind-engine/chunking/regex-typescript
 * Regex-based chunking for TypeScript/JavaScript files (medium-sized files)
 *
 * This chunker uses regex patterns instead of full AST parsing to reduce memory usage.
 * Suitable for files 100KB - 500KB using sliding window streaming.
 */

import type { Chunk, ChunkingOptions, Chunker } from './chunker';
import { slidingWindowStream } from './sliding-window';

export interface RegexChunkingOptions extends ChunkingOptions {
  includeComments?: boolean;
}

const DEFAULT_OPTIONS: Required<RegexChunkingOptions> = {
  includeComments: true,
  maxLines: 200,
  minLines: 20,
  preserveContext: true,
};

/**
 * Regex-based TypeScript/JavaScript Chunker
 * Memory-efficient alternative to AST parsing for medium-sized files
 */
export class RegexTypeScriptChunker implements Chunker {
  readonly id = 'regex-typescript';
  readonly extensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'];
  readonly languages = ['typescript', 'javascript', 'tsx', 'jsx'];

  chunk(sourceCode: string, filePath: string, options: ChunkingOptions = {}): Chunk[] {
    const opts: Required<RegexChunkingOptions> = {
      ...DEFAULT_OPTIONS,
      ...options,
    };

    const chunks: Chunk[] = [];

    // Extract top-level declarations using memory-efficient method (NO split!)
    const declarations = this.extractDeclarationsNoSplit(sourceCode);

    for (const decl of declarations) {
      const lineCount = decl.endLine - decl.startLine + 1;

      // Filter by size constraints
      if (lineCount >= opts.minLines && lineCount <= opts.maxLines) {
        chunks.push({
          text: decl.text,
          span: {
            startLine: decl.startLine,
            endLine: decl.endLine,
          },
          type: decl.type,
          name: decl.name,
          metadata: {
            chunkMethod: 'regex-based',
            declarationType: decl.type,
          },
        });
      } else if (lineCount > opts.maxLines) {
        // Split large declarations into smaller chunks (NO split!)
        const subChunks = this.splitLargeDeclarationNoSplit(sourceCode, decl, opts.maxLines);
        chunks.push(...subChunks);
      }
    }

    // If no chunks found, fall back to line-based chunking (NO split!)
    if (chunks.length === 0) {
      return this.chunkByLinesNoSplit(sourceCode, opts);
    }

    return chunks;
  }

  /**
   * Stream-based chunking using sliding window
   * For large files (>100KB), processes file in chunks without loading everything into memory
   */
  async *chunkStream(filePath: string, options: ChunkingOptions = {}): AsyncGenerator<Chunk> {
    const opts: Required<RegexChunkingOptions> = {
      ...DEFAULT_OPTIONS,
      ...options,
    };

    // Use sliding window to process file in chunks
    for await (const chunk of slidingWindowStream(
      filePath,
      (window, offsetLines) => {
        // Process window with regex chunking - NO split('\n')!
        const declarations = this.extractDeclarationsNoSplit(window);

        const windowChunks: Chunk[] = [];

        for (const decl of declarations) {
          const lineCount = decl.endLine - decl.startLine + 1;

          if (lineCount >= opts.minLines && lineCount <= opts.maxLines) {
            // Truncation already done in extractDeclarationsNoSplit
            windowChunks.push({
              text: decl.text,
              span: {
                startLine: decl.startLine + offsetLines,
                endLine: decl.endLine + offsetLines,
              },
              type: decl.type,
              name: decl.name,
              metadata: {
                chunkMethod: 'regex-streaming',
                declarationType: decl.type,
              },
            });
          }
        }

        return windowChunks;
      },
      {
        windowSize: 50 * 1024, // 50KB window
        overlap: 5 * 1024, // 5KB overlap for context
      },
    )) {
      yield chunk;
    }
  }

  /**
   * Extract declarations WITHOUT split('\n') - memory efficient
   * Works directly on source code string using character positions
   */
  private extractDeclarationsNoSplit(sourceCode: string): Declaration[] {
    const declarations: Declaration[] = [];

    // Patterns for different declaration types
    const patterns = [
      // Function declarations: function name(...) { ... }
      {
        type: 'function' as const,
        pattern: /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
      },
      // Class declarations: class Name { ... }
      {
        type: 'class' as const,
        pattern: /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/g,
      },
      // Interface declarations: interface Name { ... }
      {
        type: 'interface' as const,
        pattern: /(?:export\s+)?interface\s+(\w+)/g,
      },
      // Type declarations: type Name = ...
      {
        type: 'type' as const,
        pattern: /(?:export\s+)?type\s+(\w+)\s*=/g,
      },
      // Const/let declarations (top-level only)
      {
        type: 'const' as const,
        pattern: /(?:export\s+)?const\s+(\w+)\s*=/g,
      },
    ];

    for (const { type, pattern } of patterns) {
      let match;
      while ((match = pattern.exec(sourceCode)) !== null) {
        const name = match[1];
        if (!name) {continue;} // Skip if name is undefined

        const startIndex = match.index;
        const startLine = this.getLineNumberEfficient(sourceCode, startIndex);

        // Find the end of this declaration
        const endIndex = this.findDeclarationEnd(sourceCode, startIndex, type);
        const endLine = this.getLineNumberEfficient(sourceCode, endIndex);

        // Extract the text with IMMEDIATE truncation to prevent large allocations
        const MAX_DECL_SIZE = 50000; // 50KB limit
        const declLength = endIndex - startIndex + 1;
        const text = declLength > MAX_DECL_SIZE
          ? sourceCode.slice(startIndex, startIndex + MAX_DECL_SIZE) + '\n// [TRUNCATED]'
          : sourceCode.slice(startIndex, endIndex + 1);

        declarations.push({
          type,
          name,
          startLine,
          endLine,
          text,
          startIndex,
          endIndex,
        });
      }
    }

    // Sort by start position and remove overlaps
    declarations.sort((a, b) => a.startIndex - b.startIndex);
    return this.removeOverlaps(declarations);
  }

  /**
   * Calculate line number efficiently without split('\n')
   * Counts newlines up to the given index
   */
  private getLineNumberEfficient(sourceCode: string, index: number): number {
    let lineNumber = 1;
    for (let i = 0; i < index && i < sourceCode.length; i++) {
      if (sourceCode[i] === '\n') {
        lineNumber++;
      }
    }
    return lineNumber;
  }


  private findDeclarationEnd(sourceCode: string, startIndex: number, type: string): number {
    // For types and consts, find the semicolon or end of line
    if (type === 'type' || type === 'const') {
      const semicolonIndex = sourceCode.indexOf(';', startIndex);
      if (semicolonIndex !== -1) {
        return semicolonIndex;
      }
      // If no semicolon, find end of statement (newline or EOF)
      const newlineIndex = sourceCode.indexOf('\n', startIndex);
      return newlineIndex !== -1 ? newlineIndex : sourceCode.length - 1;
    }

    // For functions, classes, interfaces - find matching closing brace
    let braceCount = 0;
    let inBraces = false;
    let i = startIndex;

    // Find the opening brace
    while (i < sourceCode.length && sourceCode[i] !== '{') {
      i++;
    }

    if (i >= sourceCode.length) {
      return sourceCode.length - 1;
    }

    // Count braces to find the matching closing brace
    for (; i < sourceCode.length; i++) {
      const char = sourceCode[i];

      if (char === '{') {
        braceCount++;
        inBraces = true;
      } else if (char === '}') {
        braceCount--;
        if (inBraces && braceCount === 0) {
          return i;
        }
      }
    }

    return sourceCode.length - 1;
  }

  // Removed getLineNumber() - replaced with getLineNumberEfficient() to prevent OOM

  private removeOverlaps(declarations: Declaration[]): Declaration[] {
    const result: Declaration[] = [];
    let lastEnd = -1;

    for (const decl of declarations) {
      // Skip if this declaration overlaps with the previous one
      if (decl.startIndex > lastEnd) {
        result.push(decl);
        lastEnd = decl.endIndex;
      }
    }

    return result;
  }

  /**
   * Split large declaration into smaller chunks WITHOUT split()
   * Memory-efficient version that works directly on source code
   */
  private splitLargeDeclarationNoSplit(sourceCode: string, decl: Declaration, maxLines: number): Chunk[] {
    const chunks: Chunk[] = [];
    const declText = decl.text;

    // Count lines in declaration text without split
    let lineCount = 1;
    for (let i = 0; i < declText.length; i++) {
      if (declText[i] === '\n') {lineCount++;}
    }

    if (lineCount <= maxLines) {
      // No need to split
      return [{
        text: declText,
        span: {
          startLine: decl.startLine,
          endLine: decl.endLine,
        },
        type: decl.type,
        name: decl.name,
        metadata: {
          chunkMethod: 'regex-based',
        },
      }];
    }

    // Split into chunks by counting newlines
    let currentStart = decl.startLine;
    let textStart = 0;
    let currentLineCount = 0;

    for (let i = 0; i < declText.length; i++) {
      if (declText[i] === '\n') {
        currentLineCount++;

        if (currentLineCount >= maxLines) {
          const chunkText = declText.slice(textStart, i + 1);
          chunks.push({
            text: chunkText,
            span: {
              startLine: currentStart,
              endLine: currentStart + currentLineCount - 1,
            },
            type: decl.type,
            name: decl.name,
            metadata: {
              chunkMethod: 'regex-based',
              isSubChunk: true,
              originalStart: decl.startLine,
              originalEnd: decl.endLine,
            },
          });

          currentStart += currentLineCount;
          textStart = i + 1;
          currentLineCount = 0;
        }
      }
    }

    // Add remaining text
    if (textStart < declText.length) {
      const chunkText = declText.slice(textStart);
      if (chunkText.trim().length > 0) {
        chunks.push({
          text: chunkText,
          span: {
            startLine: currentStart,
            endLine: decl.endLine,
          },
          type: decl.type,
          name: decl.name,
          metadata: {
            chunkMethod: 'regex-based',
            isSubChunk: true,
            originalStart: decl.startLine,
            originalEnd: decl.endLine,
          },
        });
      }
    }

    return chunks;
  }

  /**
   * Chunk by lines WITHOUT split() - memory efficient fallback
   * Counts newlines and extracts chunks directly from source code
   */
  private chunkByLinesNoSplit(sourceCode: string, options: Required<RegexChunkingOptions>): Chunk[] {
    const chunks: Chunk[] = [];
    const maxLines = options.maxLines;

    let currentLine = 1;
    let chunkStartLine = 1;
    let chunkStartIndex = 0;
    let lineCountInChunk = 0;

    for (let i = 0; i < sourceCode.length; i++) {
      if (sourceCode[i] === '\n') {
        lineCountInChunk++;
        currentLine++;

        // Check if we've reached max lines for this chunk
        if (lineCountInChunk >= maxLines) {
          const text = sourceCode.slice(chunkStartIndex, i + 1);

          if (text.trim().length > 0) {
            chunks.push({
              text,
              span: {
                startLine: chunkStartLine,
                endLine: currentLine - 1,
              },
              type: 'code-block',
              metadata: {
                chunkMethod: 'line-based-fallback',
              },
            });
          }

          // Start new chunk
          chunkStartLine = currentLine;
          chunkStartIndex = i + 1;
          lineCountInChunk = 0;
        }
      }
    }

    // Add remaining text as final chunk
    if (chunkStartIndex < sourceCode.length) {
      const text = sourceCode.slice(chunkStartIndex);

      if (text.trim().length > 0) {
        chunks.push({
          text,
          span: {
            startLine: chunkStartLine,
            endLine: currentLine,
          },
          type: 'code-block',
          metadata: {
            chunkMethod: 'line-based-fallback',
          },
        });
      }
    }

    return chunks;
  }
}

interface Declaration {
  type: 'function' | 'class' | 'interface' | 'type' | 'const';
  name: string;
  startLine: number;
  endLine: number;
  text: string;
  startIndex: number;
  endIndex: number;
}
