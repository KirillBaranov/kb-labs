/**
 * Go Tree-sitter Chunker
 *
 * AST-aware chunking for Go files.
 * Respects semantic boundaries: functions, structs, interfaces stay intact.
 */

import { TreeSitterChunker } from './tree-sitter-base';

/**
 * Go chunker using tree-sitter
 */
export class GoTreeSitterChunker extends TreeSitterChunker {
  constructor() {
    super({
      id: 'go-tree-sitter',
      language: 'go',
      extensions: ['.go'],
    });
  }
}

/**
 * Convenience export for direct usage
 */
export const chunkGoTreeSitter = (sourceCode: string, filePath: string, options = {}) => {
  const chunker = new GoTreeSitterChunker();
  return chunker.chunk(sourceCode, filePath, options);
};
