/**
 * @module @kb-labs/mind-engine/chunking
 * Chunking system with adaptive strategy selection
 */

export type { Chunk, ChunkingOptions, Chunker } from './chunker';
export { ChunkerRegistry, globalChunkerRegistry } from './chunker';

// Export chunkers
// REMOVED: TypeScriptASTChunker (uses 8.7MB TypeScript compiler, redundant with tree-sitter)
// export { TypeScriptASTChunker, chunkTypeScriptAST } from './ast-typescript';
export { MarkdownChunker, chunkMarkdown } from './markdown';
export { LineBasedChunker } from './line-based';

// Export tree-sitter chunkers
export { TypeScriptTreeSitterChunker, chunkTypeScriptTreeSitter } from './tree-sitter-typescript';
export { JavaScriptTreeSitterChunker, chunkJavaScriptTreeSitter } from './tree-sitter-javascript';
export { CSharpTreeSitterChunker, chunkCSharpTreeSitter } from './tree-sitter-csharp';
export { PythonTreeSitterChunker, chunkPythonTreeSitter } from './tree-sitter-python';
export { GoTreeSitterChunker, chunkGoTreeSitter } from './tree-sitter-go';
export { RustTreeSitterChunker, chunkRustTreeSitter } from './tree-sitter-rust';

// Register default chunkers
import { MarkdownChunker } from './markdown';
import { LineBasedChunker } from './line-based';
import { globalChunkerRegistry, type Chunker } from './chunker';

// Tree-sitter chunkers (registered by AdaptiveChunkerFactory, also available globally)
import { TypeScriptTreeSitterChunker } from './tree-sitter-typescript';
import { JavaScriptTreeSitterChunker } from './tree-sitter-javascript';
import { CSharpTreeSitterChunker } from './tree-sitter-csharp';
import { PythonTreeSitterChunker } from './tree-sitter-python';
import { GoTreeSitterChunker } from './tree-sitter-go';
import { RustTreeSitterChunker } from './tree-sitter-rust';

// Register built-in chunkers
globalChunkerRegistry.register(new MarkdownChunker());
globalChunkerRegistry.register(new LineBasedChunker());

// Register tree-sitter chunkers
globalChunkerRegistry.register(new TypeScriptTreeSitterChunker());
globalChunkerRegistry.register(new JavaScriptTreeSitterChunker());
globalChunkerRegistry.register(new CSharpTreeSitterChunker());
globalChunkerRegistry.register(new PythonTreeSitterChunker());
globalChunkerRegistry.register(new GoTreeSitterChunker());
globalChunkerRegistry.register(new RustTreeSitterChunker());

/**
 * Get appropriate chunker for file
 * Returns line-based chunker as fallback if no specific chunker found
 */
export function getChunkerForFile(
  filePath: string,
  language?: string,
): Chunker {
  const chunker = globalChunkerRegistry.find(filePath, language);
  return chunker ?? new LineBasedChunker();
}

