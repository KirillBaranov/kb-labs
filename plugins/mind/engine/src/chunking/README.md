# Chunking System

Adaptive chunking system with support for multiple programming languages.

## Architecture

### Chunker Interface

All chunkers implement the `Chunker` interface:

```typescript
interface Chunker {
  readonly id: string;
  readonly extensions: string[];
  readonly languages?: string[];
  chunk(sourceCode: string, filePath: string, options: ChunkingOptions): Chunk[];
}
```

### Chunker Registry

`ChunkerRegistry` automatically selects the appropriate chunker based on:
- File extension (`.ts`, `.py`, `.go`, etc.)
- Programming language (from `KnowledgeSource.language`)

### Built-in Chunkers

1. **TypeScriptASTChunker** - AST-based for TypeScript/JavaScript
2. **MarkdownChunker** - Structure-based for Markdown
3. **LineBasedChunker** - Fallback for all other languages

## Adding a New Language

### Example: Python AST Chunker

```typescript
// packages/mind-engine/src/chunking/ast-python.ts
import type { Chunk, ChunkingOptions, Chunker } from './chunker.js';
import * as ast from 'python-ast-parser'; // hypothetical

export class PythonASTChunker implements Chunker {
  readonly id = 'python-ast';
  readonly extensions = ['.py', '.pyi'];
  readonly languages = ['python'];

  chunk(sourceCode: string, filePath: string, options: ChunkingOptions): Chunk[] {
    // Parse Python AST and extract functions, classes, etc.
    const ast = parsePython(sourceCode);
    // ... extract chunks
    return chunks;
  }
}

// Registration
import { globalChunkerRegistry } from './chunking/index.js';
globalChunkerRegistry.register(new PythonASTChunker());
```

### Example: Go AST Chunker

```typescript
// packages/mind-engine/src/chunking/ast-go.ts
import type { Chunk, ChunkingOptions, Chunker } from './chunker.js';
import * as go from 'go-ast-parser'; // hypothetical

export class GoASTChunker implements Chunker {
  readonly id = 'go-ast';
  readonly extensions = ['.go'];
  readonly languages = ['go'];

  chunk(sourceCode: string, filePath: string, options: ChunkingOptions): Chunk[] {
    // Parse Go AST and extract functions, types, etc.
    const ast = parseGo(sourceCode);
    // ... extract chunks
    return chunks;
  }
}

// Registration
import { globalChunkerRegistry } from './chunking/index.js';
globalChunkerRegistry.register(new GoASTChunker());
```

## Usage

Chunker is automatically selected when calling `chunkFile()`:

```typescript
// In MindEngine
const chunker = getChunkerForFile(relativePath, source.language);
const chunks = chunker.chunk(contents, relativePath, options);
```

## Plugin Extension (Future)

In the future, support for registering chunkers via plugins can be added:

```typescript
// In kb.config.json
{
  "knowledge": {
    "engines": [{
      "options": {
        "chunking": {
          "customChunkers": [
            {
              "id": "python-ast",
              "module": "@my-org/mind-python-chunker",
              "extensions": [".py"]
            }
          ]
        }
      }
    }]
  }
}
```

