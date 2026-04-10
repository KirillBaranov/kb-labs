/**
 * @module @kb-labs/mind-engine/chunking/chunker
 * Chunker interface and registry for adaptive chunking strategy selection
 */

import type { SpanRange } from '../types/engine-contracts';

export interface Chunk {
  text: string;
  span: SpanRange;
  type: string;
  name?: string;
  metadata?: Record<string, unknown>;
}

export interface ChunkingOptions {
  maxLines?: number;
  minLines?: number;
  preserveContext?: boolean;
  [key: string]: unknown; // Allow language-specific options
}

export interface Chunker {
  /**
   * Unique identifier for this chunker
   */
  readonly id: string;

  /**
   * Supported file extensions (e.g., ['.ts', '.tsx'])
   */
  readonly extensions: string[];

  /**
   * Supported languages (e.g., ['typescript', 'javascript'])
   */
  readonly languages?: string[];

  /**
   * Chunk source code into semantic chunks
   * For small files or when full content is already loaded
   */
  chunk(sourceCode: string, filePath: string, options: ChunkingOptions): Chunk[];

  /**
   * Stream-based chunking for large files
   * Processes file in chunks without loading entire content into memory
   * Optional - if not implemented, falls back to chunk() method
   */
  chunkStream?(filePath: string, options: ChunkingOptions): AsyncGenerator<Chunk>;
}

/**
 * Chunker registry for adaptive selection
 */
export class ChunkerRegistry {
  private readonly chunkers = new Map<string, Chunker>();
  private readonly extensionMap = new Map<string, Chunker>();
  private readonly languageMap = new Map<string, Chunker>();

  /**
   * Register a chunker
   */
  register(chunker: Chunker): void {
    this.chunkers.set(chunker.id, chunker);

    // Index by extensions
    for (const ext of chunker.extensions) {
      const normalizedExt = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
      this.extensionMap.set(normalizedExt, chunker);
    }

    // Index by languages
    if (chunker.languages) {
      for (const lang of chunker.languages) {
        this.languageMap.set(lang.toLowerCase(), chunker);
      }
    }
  }

  /**
   * Find chunker by file extension
   */
  findByExtension(filePath: string): Chunker | null {
    const ext = this.getExtension(filePath);
    return this.extensionMap.get(ext) ?? null;
  }

  /**
   * Find chunker by language
   */
  findByLanguage(language: string): Chunker | null {
    return this.languageMap.get(language.toLowerCase()) ?? null;
  }

  /**
   * Find chunker by file path and language
   * Tries extension first, then language
   */
  find(filePath: string, language?: string): Chunker | null {
    // Try extension first
    const byExt = this.findByExtension(filePath);
    if (byExt) {
      return byExt;
    }

    // Try language
    if (language) {
      const byLang = this.findByLanguage(language);
      if (byLang) {
        return byLang;
      }
    }

    return null;
  }

  /**
   * Get all registered chunkers
   */
  getAll(): Chunker[] {
    return Array.from(this.chunkers.values());
  }

  private getExtension(filePath: string): string {
    const lastDot = filePath.lastIndexOf('.');
    if (lastDot === -1) {
      return '';
    }
    return `.${filePath.slice(lastDot + 1).toLowerCase()}`;
  }
}

/**
 * Global chunker registry instance
 */
export const globalChunkerRegistry = new ChunkerRegistry();





