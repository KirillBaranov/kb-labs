# ADR-0020: AST-Based Chunking for Code Files

**Date:** 2025-11-18
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-18
**Tags:** [architecture, chunking, code-analysis]

## Context

Code files need to be split into chunks for indexing. Different approaches have different trade-offs:

- **Line-Based**: Simple but breaks code structure
- **Fixed-Size**: Easy but splits functions/classes arbitrarily
- **AST-Based**: Preserves code structure but more complex

We need a chunking strategy that preserves semantic meaning and code structure for better search quality.

## Decision

We will implement **AST-based chunking** for TypeScript/JavaScript files with fallback to line-based:

1. **Primary Strategy**: AST-based chunking using TypeScript compiler API
2. **Fallback Strategy**: Line-based chunking if AST parsing fails
3. **Language-Specific**: Different chunkers for different file types
4. **Registry Pattern**: Pluggable chunker registry

### Architecture

```typescript
export interface Chunker {
  id: string;
  extensions: string[];
  languages: string[];
  chunk(sourceCode: string, filePath: string, options: ChunkingOptions): Chunk[];
}

// AST-based chunker for TypeScript
export class TypeScriptASTChunker implements Chunker {
  chunk(sourceCode: string, filePath: string, options: ChunkingOptions): Chunk[] {
    const sourceFile = ts.createSourceFile(filePath, sourceCode, ...);
    
    // Extract nodes (functions, classes, interfaces, etc.)
    ts.forEachChild(sourceFile, node => {
      const chunk = extractNodeChunk(node, sourceFile, sourceCode);
      if (chunk) chunks.push(chunk);
    });
    
    return chunks;
  }
}

// Registry for finding appropriate chunker
export function getChunkerForFile(filePath: string, language?: string): Chunker {
  const chunker = globalChunkerRegistry.find(filePath, language);
  return chunker ?? new LineBasedChunker(); // Fallback
}
```

### Chunking Strategies

1. **TypeScriptASTChunker**: AST-based for TS/JS
   - Extracts functions, classes, interfaces, types
   - Preserves imports and JSDoc comments
   - Maintains code structure
   - Adds metadata (functionName, className, typeName)

2. **MarkdownChunker**: Heading-based for Markdown
   - Splits by headings
   - Preserves hierarchy
   - Includes heading context

3. **LineBasedChunker**: Fallback for other files
   - Simple line-based splitting
   - Configurable line counts
   - Overlap support

## Rationale

### Why AST-Based?

- **Semantic Preservation**: Keeps code structure intact
- **Better Search**: Chunks align with code concepts
- **Metadata**: Can extract function/class names
- **Quality**: Higher quality chunks for semantic search

### Why Fallback?

- **Robustness**: Works even if AST parsing fails
- **Universal**: Can chunk any file type
- **Simplicity**: Line-based is simple and reliable

### Why Registry Pattern?

- **Extensibility**: Easy to add new chunkers
- **Language-Specific**: Different strategies for different languages
- **Automatic Selection**: Finds appropriate chunker automatically

## Consequences

### Positive

- **Better Chunks**: Preserves code structure
- **Metadata**: Extracts function/class names
- **Search Quality**: Better semantic search results
- **Extensibility**: Easy to add new chunkers

### Negative

- **Complexity**: More complex than line-based
- **Performance**: AST parsing is slower
- **Dependencies**: Requires TypeScript compiler API
- **Language-Specific**: Need chunker for each language

### Mitigation Strategies

- **Fallback**: Line-based fallback ensures robustness
- **Caching**: Can cache AST parsing results
- **Performance**: AST parsing is fast enough for indexing
- **Extensibility**: Registry makes adding languages easy

## Implementation

### Chunker Registry

```typescript
const registry = new ChunkerRegistry();
registry.register(new TypeScriptASTChunker());
registry.register(new MarkdownChunker());
registry.register(new LineBasedChunker());

// Automatic selection
const chunker = registry.find('src/utils.ts', 'typescript');
```

### Metadata Extraction

AST chunker extracts:
- Function names
- Class names
- Type/interface names
- JSDoc comments
- Import statements

### Configuration

```json
{
  "knowledge": {
    "engines": [{
      "options": {
        "chunk": {
          "codeLines": 120,
          "docLines": 80,
          "overlap": 20
        }
      }
    }]
  }
}
```

## Testing Strategy

- Unit tests for each chunker
- Test AST parsing edge cases
- Test fallback behavior
- Test metadata extraction

## Future Enhancements

- Add Python AST chunker
- Add Go AST chunker
- Add Rust AST chunker
- Improve metadata extraction
- Add code structure visualization

## Alternatives Considered

### Line-Based Only

- **Pros**: Simple, universal, fast
- **Cons**: Breaks code structure, lower quality
- **Decision**: Rejected - need better quality

### Fixed-Size Chunks

- **Pros**: Simple, predictable
- **Cons**: Splits functions/classes arbitrarily
- **Decision**: Rejected - need semantic chunks

### External Parser

- **Pros**: More languages supported
- **Cons**: External dependency, complexity
- **Decision**: Rejected - TypeScript API is sufficient

## References

- [TypeScript Compiler API](https://github.com/Microsoft/TypeScript/wiki/Using-the-Compiler-API)
- [ADR-0016: Vector Store Abstraction](./0016-vector-store-abstraction.md)

---

**Last Updated:** 2025-11-18  
**Next Review:** 2026-02-18 (quarterly review)

