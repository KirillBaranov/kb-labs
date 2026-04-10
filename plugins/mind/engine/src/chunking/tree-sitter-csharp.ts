/**
 * C# Tree-sitter Chunker
 *
 * AST-aware chunking for C# files.
 * Respects semantic boundaries: methods, classes, namespaces stay intact.
 */

import { TreeSitterChunker } from './tree-sitter-base';

/**
 * C# chunker using tree-sitter
 */
export class CSharpTreeSitterChunker extends TreeSitterChunker {
  constructor() {
    super({
      id: 'csharp-tree-sitter',
      language: 'csharp',
      extensions: ['.cs'],
    });
  }
}

/**
 * Convenience export for direct usage
 */
export const chunkCSharpTreeSitter = (sourceCode: string, filePath: string, options = {}) => {
  const chunker = new CSharpTreeSitterChunker();
  return chunker.chunk(sourceCode, filePath, options);
};
