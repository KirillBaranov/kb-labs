/**
 * @module @kb-labs/mind-engine/chunking/markdown
 * Structure-based chunking for Markdown files
 */

import * as fs from 'node:fs';
import * as readline from 'node:readline';
import type { Chunk, ChunkingOptions, Chunker } from './chunker';
import { readLinesFromString } from '../utils/streaming';

export interface MarkdownChunkingOptions extends ChunkingOptions {
  byHeadings?: boolean;
  includeCodeBlocks?: boolean;
}

const DEFAULT_OPTIONS: Required<MarkdownChunkingOptions> = {
  byHeadings: true,
  includeCodeBlocks: true,
  maxLines: 150,
  minLines: 5, // Lowered from 30 to index short ADR sections (see ADR-0038)
  preserveContext: true,
};

/**
 * Markdown Structure Chunker
 */
export class MarkdownChunker implements Chunker {
  readonly id = 'markdown-structure';
  readonly extensions = ['.md', '.mdx', '.markdown'];
  readonly languages = ['markdown', 'mdx'];

  chunk(sourceCode: string, filePath: string, options: ChunkingOptions = {}): Chunk[] {
    const opts: Required<MarkdownChunkingOptions> = {
      ...DEFAULT_OPTIONS,
      ...options,
    };

    // NOTE: For small files, we use sync wrapper. For large files, use chunkStream() instead.
    // This is a compatibility layer - prefer chunkStream() for production use.

    // Simple synchronous split for compatibility (only for small files < 100KB)
    // For large files, the caller should use chunkStream() which is fully streaming
    if (sourceCode.length > 100 * 1024) {
      throw new Error('File too large for sync chunking. Use chunkStream() instead.');
    }

    const chunks: Chunk[] = [];
    const lines = sourceCode.split('\n'); // OK for small files

    if (opts.byHeadings) {
      // Chunk by headings
      let currentChunk: {
        startLine: number;
        level: number;
        title?: string;
        lines: string[];
      } | null = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

        if (headingMatch) {
          if (currentChunk && currentChunk.lines.length >= opts.minLines) {
            chunks.push({
              text: currentChunk.lines.join('\n'),
              span: {
                startLine: currentChunk.startLine,
                endLine: currentChunk.startLine + currentChunk.lines.length - 1,
              },
              type: 'markdown-heading',
              name: currentChunk.title,
              metadata: {
                headingLevel: currentChunk.level,
                headingTitle: currentChunk.title,
              },
            });
          }

          const level = headingMatch[1]!.length;
          const title = headingMatch[2]!.trim();
          currentChunk = {
            startLine: i + 1,
            level,
            title,
            lines: [line],
          };
        } else if (currentChunk) {
          currentChunk.lines.push(line);
        } else {
          if (!currentChunk) {
            currentChunk = {
              startLine: i + 1,
              level: 0,
              lines: [],
            };
          }
          currentChunk.lines.push(line);
        }
      }

      if (currentChunk && currentChunk.lines.length >= opts.minLines) {
        chunks.push({
          text: currentChunk.lines.join('\n'),
          span: {
            startLine: currentChunk.startLine,
            endLine: currentChunk.startLine + currentChunk.lines.length - 1,
          },
          type: 'markdown-heading',
          name: currentChunk.title,
          metadata: {
            headingLevel: currentChunk.level,
            headingTitle: currentChunk.title,
          },
        });
      }
    } else {
      // Line-based chunking
      let start = 0;
      while (start < lines.length) {
        const end = Math.min(lines.length, start + opts.maxLines);
        const chunkLines = lines.slice(start, end);
        const text = chunkLines.join('\n');

        if (text.trim().length >= opts.minLines) {
          chunks.push({
            text,
            span: {
              startLine: start + 1,
              endLine: end,
            },
            type: 'markdown-line',
            metadata: {
              chunkMethod: 'line-based',
            },
          });
        }

        start = end;
      }
    }

    return chunks;
  }

  /**
   * Stream-based chunking for markdown files
   * Processes file line-by-line, yielding sections as they are completed
   */
  async *chunkStream(filePath: string, options: ChunkingOptions = {}): AsyncGenerator<Chunk> {
    const opts: Required<MarkdownChunkingOptions> = {
      ...DEFAULT_OPTIONS,
      ...options,
    };

    const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let currentSection = '';
    let currentHeading = '';
    let startLine = 1;
    let lineNum = 0;
    let inCodeBlock = false;
    const MAX_CHUNK_TEXT = 50000; // 50KB limit

    try {
      for await (const line of rl) {
        lineNum++;

        // Track code blocks
        if (line.trim().startsWith('```')) {
          inCodeBlock = !inCodeBlock;
        }

        // Detect heading (only outside code blocks)
        if (!inCodeBlock && /^#{1,6}\s/.test(line)) {
          // Yield previous section if it exists
          if (currentSection.trim()) {
            // CRITICAL: Truncate text BEFORE creating chunk to prevent large allocations
            const truncatedText = currentSection.length > MAX_CHUNK_TEXT
              ? currentSection.slice(0, MAX_CHUNK_TEXT) + '\n<!-- [TRUNCATED] -->'
              : currentSection;

            yield {
              text: truncatedText,
              span: { startLine, endLine: lineNum - 1 },
              type: 'markdown-section',
              name: currentHeading,
              metadata: {
                chunkMethod: 'markdown-streaming',
                heading: currentHeading,
                wasTruncated: currentSection.length > MAX_CHUNK_TEXT,
                originalSize: currentSection.length,
              },
            };
          }

          // Start new section
          currentHeading = line.replace(/^#+\s*/, '').trim();
          currentSection = line + '\n';
          startLine = lineNum;
        } else {
          currentSection += line + '\n';
        }
      }

      // Yield final section
      if (currentSection.trim()) {
        // CRITICAL: Truncate text BEFORE creating chunk to prevent large allocations
        const truncatedText = currentSection.length > MAX_CHUNK_TEXT
          ? currentSection.slice(0, MAX_CHUNK_TEXT) + '\n<!-- [TRUNCATED] -->'
          : currentSection;

        yield {
          text: truncatedText,
          span: { startLine, endLine: lineNum },
          type: 'markdown-section',
          name: currentHeading,
          metadata: {
            chunkMethod: 'markdown-streaming',
            heading: currentHeading,
            isLastSection: true,
            wasTruncated: currentSection.length > MAX_CHUNK_TEXT,
            originalSize: currentSection.length,
          },
        };
      }
    } finally {
      fileStream.close();
    }
  }
}

/**
 * Legacy function for backward compatibility
 */
export function chunkMarkdown(
  sourceCode: string,
  options: MarkdownChunkingOptions = {},
): Chunk[] {
  const chunker = new MarkdownChunker();
  return chunker.chunk(sourceCode, '', options);
}

/**
 * Chunk markdown by headings WITHOUT split('\n') - memory efficient
 * Uses character-by-character scanning to find sections
 */
async function chunkByHeadings(
  sourceCode: string,
  options: Required<MarkdownChunkingOptions>,
): Promise<Chunk[]> {
  const chunks: Chunk[] = [];
  let currentChunk: {
    startLine: number;
    level: number;
    title?: string;
    text: string;
    lineCount: number;
  } | null = null;

  let lineNum = 0;

  // Use streaming line reader (no split!)
  for await (const line of readLinesFromString(sourceCode)) {
    lineNum++;
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      // Save previous chunk if exists
      if (currentChunk && currentChunk.lineCount >= options.minLines) {
        // Truncate if needed
        const MAX_CHUNK_TEXT = 50000;
        const text = currentChunk.text.length > MAX_CHUNK_TEXT
          ? currentChunk.text.slice(0, MAX_CHUNK_TEXT) + '\n<!-- [TRUNCATED] -->'
          : currentChunk.text;

        chunks.push({
          text,
          span: {
            startLine: currentChunk.startLine,
            endLine: currentChunk.startLine + currentChunk.lineCount - 1,
          },
          type: 'markdown-heading',
          name: currentChunk.title,
          metadata: {
            headingLevel: currentChunk.level,
            headingTitle: currentChunk.title,
          },
        });
      }

      // Start new chunk
      const level = headingMatch[1]!.length;
      const title = headingMatch[2]!.trim();
      currentChunk = {
        startLine: lineNum,
        level,
        title,
        text: line + '\n',
        lineCount: 1,
      };
    } else if (currentChunk) {
      currentChunk.text += line + '\n';
      currentChunk.lineCount++;
    } else {
      // Content before first heading
      if (!currentChunk) {
        currentChunk = {
          startLine: lineNum,
          level: 0,
          text: '',
          lineCount: 0,
        };
      }
      currentChunk.text += line + '\n';
      currentChunk.lineCount++;
    }
  }

  // Add final chunk
  if (currentChunk && currentChunk.lineCount >= options.minLines) {
    const MAX_CHUNK_TEXT = 50000;
    const text = currentChunk.text.length > MAX_CHUNK_TEXT
      ? currentChunk.text.slice(0, MAX_CHUNK_TEXT) + '\n<!-- [TRUNCATED] -->'
      : currentChunk.text;

    chunks.push({
      text,
      span: {
        startLine: currentChunk.startLine,
        endLine: currentChunk.startLine + currentChunk.lineCount - 1,
      },
      type: 'markdown-heading',
      name: currentChunk.title,
      metadata: {
        headingLevel: currentChunk.level,
        headingTitle: currentChunk.title,
      },
    });
  }

  // Split chunks that exceed maxLines (NO split!)
  const finalChunks: Chunk[] = [];
  for (const chunk of chunks) {
    // Count lines without split
    let lineCount = 1;
    for (let i = 0; i < chunk.text.length; i++) {
      if (chunk.text[i] === '\n') {lineCount++;}
    }

    if (lineCount > options.maxLines) {
      const splitChunks = await splitChunkByLinesNoSplit(chunk, options.maxLines);
      finalChunks.push(...splitChunks);
    } else {
      finalChunks.push(chunk);
    }
  }

  return finalChunks;
}

/**
 * Chunk by lines WITHOUT split() - memory efficient
 */
async function chunkByLines(
  sourceCode: string,
  options: Required<MarkdownChunkingOptions>,
): Promise<Chunk[]> {
  const chunks: Chunk[] = [];
  const maxLines = options.maxLines;

  let currentLine = 1;
  let chunkStartLine = 1;
  let chunkText = '';
  let lineCountInChunk = 0;

  for await (const line of readLinesFromString(sourceCode)) {
    chunkText += line + '\n';
    lineCountInChunk++;

    if (lineCountInChunk >= maxLines) {
      if (chunkText.trim().length >= options.minLines) {
        chunks.push({
          text: chunkText,
          span: {
            startLine: chunkStartLine,
            endLine: currentLine,
          },
          type: 'markdown-line',
          metadata: {
            chunkMethod: 'line-based',
          },
        });
      }

      chunkStartLine = currentLine + 1;
      chunkText = '';
      lineCountInChunk = 0;
    }

    currentLine++;
  }

  // Add remaining text
  if (chunkText.trim().length >= options.minLines) {
    chunks.push({
      text: chunkText,
      span: {
        startLine: chunkStartLine,
        endLine: currentLine - 1,
      },
      type: 'markdown-line',
      metadata: {
        chunkMethod: 'line-based',
      },
    });
  }

  return chunks;
}

/**
 * Extract code blocks WITHOUT split() - memory efficient
 */
async function extractCodeBlocks(sourceCode: string): Promise<Chunk[]> {
  const chunks: Chunk[] = [];
  let inCodeBlock = false;
  let codeBlockStart = 0;
  let codeBlockText = '';
  let language: string | undefined;
  let lineNum = 0;

  for await (const line of readLinesFromString(sourceCode)) {
    const codeBlockStartMatch = line.match(/^```(\w+)?$/);

    if (codeBlockStartMatch) {
      if (inCodeBlock) {
        // End of code block
        if (codeBlockText.trim().length > 0) {
          chunks.push({
            text: codeBlockText,
            span: {
              startLine: codeBlockStart + 1,
              endLine: lineNum,
            },
            type: 'markdown-code-block',
            metadata: {
              chunkType: 'code-block',
              language,
            },
          });
        }
        codeBlockText = '';
        inCodeBlock = false;
        language = undefined;
      } else {
        // Start of code block
        inCodeBlock = true;
        codeBlockStart = lineNum;
        language = codeBlockStartMatch[1];
      }
    } else if (inCodeBlock) {
      codeBlockText += line + '\n';
    }

    lineNum++;
  }

  // Handle unclosed code block
  if (inCodeBlock && codeBlockText.trim().length > 0) {
    chunks.push({
      text: codeBlockText,
      span: {
        startLine: codeBlockStart + 1,
        endLine: lineNum,
      },
      type: 'markdown-code-block',
      metadata: {
        chunkType: 'code-block',
        language,
      },
    });
  }

  return chunks;
}

/**
 * Split chunk by lines WITHOUT split() - memory efficient
 * Counts newlines to determine split points
 */
async function splitChunkByLinesNoSplit(
  chunk: Chunk,
  maxLines: number,
): Promise<Chunk[]> {
  // Count lines in chunk text without split
  let lineCount = 1;
  for (let i = 0; i < chunk.text.length; i++) {
    if (chunk.text[i] === '\n') {lineCount++;}
  }

  if (lineCount <= maxLines) {
    return [chunk];
  }

  const subChunks: Chunk[] = [];
  let currentStart = chunk.span.startLine;
  let textStart = 0;
  let currentLineCount = 0;

  for (let i = 0; i < chunk.text.length; i++) {
    if (chunk.text[i] === '\n') {
      currentLineCount++;

      if (currentLineCount >= maxLines) {
        const text = chunk.text.slice(textStart, i + 1);
        subChunks.push({
          text,
          span: {
            startLine: currentStart,
            endLine: currentStart + currentLineCount - 1,
          },
          type: chunk.type,
          name: chunk.name,
          metadata: {
            ...chunk.metadata,
            isSubChunk: true,
          },
        });

        currentStart = currentStart + currentLineCount;
        textStart = i + 1;
        currentLineCount = 0;
      }
    }
  }

  // Add remaining text
  if (textStart < chunk.text.length) {
    const text = chunk.text.slice(textStart);
    if (text.trim().length > 0) {
      subChunks.push({
        text,
        span: {
          startLine: currentStart,
          endLine: chunk.span.endLine,
        },
        type: chunk.type,
        name: chunk.name,
        metadata: {
          ...chunk.metadata,
          isSubChunk: true,
        },
      });
    }
  }

  return subChunks;
}

