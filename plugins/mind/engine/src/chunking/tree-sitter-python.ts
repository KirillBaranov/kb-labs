/**
 * Python Tree-sitter Chunker
 *
 * AST-aware chunking for Python files.
 * Respects semantic boundaries: functions, classes, modules stay intact.
 */

import { TreeSitterChunker } from './tree-sitter-base';

/**
 * Python chunker using tree-sitter
 */
export class PythonTreeSitterChunker extends TreeSitterChunker {
  constructor() {
    super({
      id: 'python-tree-sitter',
      language: 'python',
      extensions: ['.py', '.pyi'],
    });
  }
}

/**
 * Convenience export for direct usage
 */
export const chunkPythonTreeSitter = (sourceCode: string, filePath: string, options = {}) => {
  const chunker = new PythonTreeSitterChunker();
  return chunker.chunk(sourceCode, filePath, options);
};
