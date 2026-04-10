/**
 * @module @kb-labs/mind-engine/chunking/adaptive-factory
 * Adaptive chunker selection based on file size and type
 *
 * Selects the optimal chunker strategy based on:
 * - File size (small/medium/large)
 * - File type (code/docs)
 * - Memory constraints
 */

import type { Chunker } from './chunker';
// REMOVED: TypeScriptASTChunker (uses 8.7MB TypeScript compiler, redundant with tree-sitter)
// import { TypeScriptASTChunker } from './ast-typescript';
import { MarkdownChunker } from './markdown';
import { RegexTypeScriptChunker } from './regex-typescript';
import { StreamingLineChunker } from './streaming-line';

// Tree-sitter based chunkers (AST-aware, semantic boundaries)
import { TypeScriptTreeSitterChunker } from './tree-sitter-typescript';
import { JavaScriptTreeSitterChunker } from './tree-sitter-javascript';
import { CSharpTreeSitterChunker } from './tree-sitter-csharp';
import { PythonTreeSitterChunker } from './tree-sitter-python';
import { GoTreeSitterChunker } from './tree-sitter-go';
import { RustTreeSitterChunker } from './tree-sitter-rust';

export interface FileInfo {
  path: string;
  size: number; // in bytes
  extension: string;
}

export interface ChunkerStrategy {
  name: string;
  maxFileSize: number; // in bytes
  memoryMultiplier: number; // estimated memory usage multiplier
  quality: 'high' | 'medium' | 'low';
  useStreaming: boolean; // whether to use streaming (chunkStream) for this strategy
}

/**
 * Chunker strategies ordered by file size thresholds
 * Uses sliding window streaming for files > 100KB to avoid OOM
 */
const TYPESCRIPT_STRATEGIES: ChunkerStrategy[] = [
  {
    name: 'typescript-tree-sitter',
    maxFileSize: 500 * 1024, // 500KB - tree-sitter is memory efficient
    memoryMultiplier: 4,
    quality: 'high',
    useStreaming: true, // Streaming with AST awareness
  },
  {
    name: 'regex-typescript',
    maxFileSize: 1024 * 1024, // 1MB - fallback if tree-sitter unavailable
    memoryMultiplier: 3,
    quality: 'medium',
    useStreaming: true, // Streaming with sliding window
  },
  {
    name: 'streaming-line',
    maxFileSize: Infinity,
    memoryMultiplier: 2,
    quality: 'low',
    useStreaming: true, // Always streaming for very large files
  },
];

/**
 * Adaptive Chunker Factory
 * Selects the optimal chunker based on file characteristics
 */
export class AdaptiveChunkerFactory {
  // Tree-sitter chunkers (AST-aware, high quality)
  private readonly tsTreeSitterChunker = new TypeScriptTreeSitterChunker();
  private readonly jsTreeSitterChunker = new JavaScriptTreeSitterChunker();
  private readonly csTreeSitterChunker = new CSharpTreeSitterChunker();
  private readonly pyTreeSitterChunker = new PythonTreeSitterChunker();
  private readonly goTreeSitterChunker = new GoTreeSitterChunker();
  private readonly rustTreeSitterChunker = new RustTreeSitterChunker();

  // Fallback chunkers
  private readonly regexChunker = new RegexTypeScriptChunker();
  private readonly streamingChunker = new StreamingLineChunker();
  private readonly markdownChunker = new MarkdownChunker();

  /**
   * Select the optimal chunker for a given file
   */
  select(file: FileInfo): Chunker {
    const ext = file.extension.toLowerCase();

    // CRITICAL: For large files, ALWAYS use streaming line chunker
    // This prevents any possibility of .split('\n') being called on large files
    const MAX_FILE_SIZE_FOR_SMART_CHUNKING = 200 * 1024; // 200KB
    if (file.size > MAX_FILE_SIZE_FOR_SMART_CHUNKING) {
      return this.streamingChunker;
    }

    // Markdown files - always use heading-based chunker
    if (ext.match(/\.md(x)?$/)) {
      return this.markdownChunker;
    }

    // TypeScript/TSX files - use tree-sitter for AST-aware chunking
    if (ext.match(/\.(ts|tsx)$/)) {
      return this.selectTypeScriptChunker(file);
    }

    // JavaScript/JSX files - use tree-sitter
    if (ext.match(/\.(js|jsx|mjs|cjs)$/)) {
      return this.selectJavaScriptChunker(file);
    }

    // C# files - use tree-sitter
    if (ext === '.cs') {
      return this.selectCSharpChunker(file);
    }

    // Python files - use tree-sitter
    if (ext.match(/\.pyi?$/)) {
      return this.selectPythonChunker(file);
    }

    // Go files - use tree-sitter
    if (ext === '.go') {
      return this.selectGoChunker(file);
    }

    // Rust files - use tree-sitter
    if (ext === '.rs') {
      return this.selectRustChunker(file);
    }

    // For other file types, use streaming (most memory-efficient)
    return this.streamingChunker;
  }

  /**
   * Select TypeScript/TSX chunker based on file size
   */
  private selectTypeScriptChunker(file: FileInfo): Chunker {
    // Check for generated/bundle files (always use streaming)
    if (this.isGeneratedFile(file.path)) {
      return this.streamingChunker;
    }

    // Use tree-sitter for files up to 500KB (high quality AST-aware chunking)
    if (file.size <= 500 * 1024) {
      return this.tsTreeSitterChunker;
    }

    // Medium files: fall back to regex (up to 1MB)
    if (file.size <= 1024 * 1024) {
      return this.regexChunker;
    }

    // Very large files use streaming-line
    return this.streamingChunker;
  }

  /**
   * Select JavaScript/JSX chunker based on file size
   */
  private selectJavaScriptChunker(file: FileInfo): Chunker {
    if (this.isGeneratedFile(file.path)) {
      return this.streamingChunker;
    }

    // Use tree-sitter for files up to 500KB
    if (file.size <= 500 * 1024) {
      return this.jsTreeSitterChunker;
    }

    // Fall back to regex for files up to 1MB
    if (file.size <= 1024 * 1024) {
      return this.regexChunker; // Regex can handle JS/TS similarly
    }

    return this.streamingChunker;
  }

  /**
   * Select C# chunker based on file size
   */
  private selectCSharpChunker(file: FileInfo): Chunker {
    // Use tree-sitter for files up to 500KB
    if (file.size <= 500 * 1024) {
      return this.csTreeSitterChunker;
    }

    return this.streamingChunker;
  }

  /**
   * Select Python chunker based on file size
   */
  private selectPythonChunker(file: FileInfo): Chunker {
    // Use tree-sitter for files up to 500KB
    if (file.size <= 500 * 1024) {
      return this.pyTreeSitterChunker;
    }

    return this.streamingChunker;
  }

  /**
   * Select Go chunker based on file size
   */
  private selectGoChunker(file: FileInfo): Chunker {
    // Use tree-sitter for files up to 500KB
    if (file.size <= 500 * 1024) {
      return this.goTreeSitterChunker;
    }

    return this.streamingChunker;
  }

  /**
   * Select Rust chunker based on file size
   */
  private selectRustChunker(file: FileInfo): Chunker {
    // Use tree-sitter for files up to 500KB
    if (file.size <= 500 * 1024) {
      return this.rustTreeSitterChunker;
    }

    return this.streamingChunker;
  }

  /**
   * Check if file is likely generated/bundled code
   */
  private isGeneratedFile(filePath: string): boolean {
    const generatedPatterns = [
      /bundle\.(js|ts)$/,
      /vendor\.(js|ts)$/,
      /\.min\.(js|ts)$/,
      /dist\/.*\.(js|ts)$/,
      /build\/.*\.(js|ts)$/,
      /node_modules\//,
    ];

    return generatedPatterns.some(pattern => pattern.test(filePath));
  }

  /**
   * Estimate memory usage for chunking a file
   */
  estimateMemoryUsage(file: FileInfo): number {
    const chunker = this.select(file);

    // Get memory multiplier for selected strategy
    let multiplier = 2; // default (streaming)

    if (chunker.id.includes('tree-sitter')) {
      multiplier = 4; // Tree-sitter is memory efficient
    } else if (chunker.id === 'regex-typescript') {
      multiplier = 3;
    } else if (chunker.id === 'markdown-structure') {
      multiplier = 3;
    } else if (chunker.id === 'streaming-line') {
      multiplier = 2;
    }

    return file.size * multiplier;
  }

  /**
   * Get strategy information for a file
   */
  getStrategy(file: FileInfo): ChunkerStrategy {
    const chunker = this.select(file);

    // Find matching strategy
    const strategy = TYPESCRIPT_STRATEGIES.find(s => s.name === chunker.id);
    if (strategy) {
      return strategy;
    }

    // Return default strategy for non-TypeScript files
    return {
      name: chunker.id,
      maxFileSize: Infinity,
      memoryMultiplier: 2,
      quality: 'medium',
      useStreaming: true, // Always use streaming for non-TypeScript files
    };
  }
}

/**
 * Create adaptive chunker factory instance
 */
export function createAdaptiveChunkerFactory(): AdaptiveChunkerFactory {
  return new AdaptiveChunkerFactory();
}
