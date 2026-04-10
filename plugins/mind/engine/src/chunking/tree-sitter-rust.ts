/**
 * Rust Tree-sitter Chunker
 *
 * AST-aware chunking for Rust files.
 * Respects semantic boundaries: functions, impl blocks, traits stay intact.
 */

import { TreeSitterChunker } from './tree-sitter-base';

/**
 * Rust chunker using tree-sitter
 */
export class RustTreeSitterChunker extends TreeSitterChunker {
  constructor() {
    super({
      id: 'rust-tree-sitter',
      language: 'rust',
      extensions: ['.rs'],
    });
  }
}

/**
 * Convenience export for direct usage
 */
export const chunkRustTreeSitter = (sourceCode: string, filePath: string, options = {}) => {
  const chunker = new RustTreeSitterChunker();
  return chunker.chunk(sourceCode, filePath, options);
};
