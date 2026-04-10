/**
 * JavaScript/JSX Tree-sitter Chunker
 *
 * AST-aware chunking for JavaScript and JSX files.
 * Respects semantic boundaries: functions, classes, components stay intact.
 */

import { TreeSitterChunker } from './tree-sitter-base';

/**
 * JavaScript chunker using tree-sitter
 */
export class JavaScriptTreeSitterChunker extends TreeSitterChunker {
  constructor() {
    super({
      id: 'javascript-tree-sitter',
      language: 'javascript',
      extensions: ['.js', '.jsx', '.mjs', '.cjs'],
    });
  }
}

/**
 * Convenience export for direct usage
 */
export const chunkJavaScriptTreeSitter = (sourceCode: string, filePath: string, options = {}) => {
  const chunker = new JavaScriptTreeSitterChunker();
  return chunker.chunk(sourceCode, filePath, options);
};
