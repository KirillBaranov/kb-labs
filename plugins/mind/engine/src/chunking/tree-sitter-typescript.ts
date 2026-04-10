/**
 * TypeScript/TSX Tree-sitter Chunker
 *
 * AST-aware chunking for TypeScript and TSX files.
 * Respects semantic boundaries: functions, classes, interfaces stay intact.
 */

import { TreeSitterChunker } from './tree-sitter-base';

/**
 * TypeScript chunker using tree-sitter
 */
export class TypeScriptTreeSitterChunker extends TreeSitterChunker {
  constructor() {
    super({
      id: 'typescript-tree-sitter',
      language: 'typescript',
      extensions: ['.ts', '.tsx'],
    });
  }
}

/**
 * Convenience export for direct usage
 */
export const chunkTypeScriptTreeSitter = (sourceCode: string, filePath: string, options = {}) => {
  const chunker = new TypeScriptTreeSitterChunker();
  return chunker.chunk(sourceCode, filePath, options);
};
