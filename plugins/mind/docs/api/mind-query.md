# Mind Query API Documentation

## Overview

The Mind Query API provides AI-oriented access to codebase knowledge through structured queries. All responses include `schemaVersion: "1.0"` for compatibility tracking.

## Query Types

### 1. Impact Query
**Purpose**: Find files that import a given module

**CLI Usage**:
```bash
kb mind query impact --file src/index.ts
kb mind query impact --file src/index.ts --ai-mode --json
```

**Parameters**:
- `file` (required): Path to the file to analyze

**Response**:
```json
{
  "ok": true,
  "code": null,
  "query": "impact",
  "params": { "file": "src/index.ts" },
  "result": {
    "importers": [
      {
        "file": "src/app.ts",
        "imports": ["CoreService", "Config"]
      }
    ],
    "count": 1
  },
  "summary": "Found 1 file(s) importing this module. Top importers: app.ts",
  "suggestNextQueries": [
    "query exports src/index.ts to see what this file exports",
    "query chain src/index.ts to see full dependency chain"
  ],
  "schemaVersion": "1.0",
  "meta": {
    "cwd": "/path/to/project",
    "queryId": "impact_abc123",
    "tokensEstimate": 150,
    "cached": false,
    "filesScanned": 1,
    "edgesTouched": 25,
    "depsHash": "sha256_abc123",
    "apiHash": "sha256_def456",
    "timingMs": { "load": 5, "filter": 12, "total": 17 }
  }
}
```

### 2. Scope Query
**Purpose**: Show dependencies within a path scope

**CLI Usage**:
```bash
kb mind query scope --path packages/core
kb mind query scope --path packages/core --depth 3 --ai-mode
```

**Parameters**:
- `path` (required): Directory path to analyze
- `depth` (optional): Maximum dependency depth (default: 5)

**Response**:
```json
{
  "ok": true,
  "code": null,
  "query": "scope",
  "params": { "path": "packages/core" },
  "result": {
    "edges": [
      {
        "from": "src/index.ts",
        "to": "src/services/core.ts",
        "type": "runtime",
        "imports": ["CoreService"]
      }
    ],
    "count": 1
  },
  "summary": "Found 1 dependency edge(s) in scope across 2 file(s)",
  "suggestNextQueries": [
    "query chain <file> to see full dependency chain",
    "query externals to see external dependencies"
  ],
  "schemaVersion": "1.0",
  "meta": { /* ... */ }
}
```

### 3. Exports Query
**Purpose**: List exports from a file

**CLI Usage**:
```bash
kb mind query exports --file src/index.ts
kb mind query exports --file src/index.ts --ai-mode --limit 10
```

**Parameters**:
- `file` (required): Path to the file to analyze

**Response**:
```json
{
  "ok": true,
  "code": null,
  "query": "exports",
  "params": { "file": "src/index.ts" },
  "result": {
    "exports": [
      {
        "name": "CoreService",
        "kind": "class",
        "signature": "class CoreService",
        "jsdoc": "Main service class"
      },
      {
        "name": "Config",
        "kind": "interface",
        "signature": "interface Config",
        "jsdoc": "Configuration interface"
      }
    ],
    "count": 2
  },
  "summary": "2 export(s) found: CoreService, Config",
  "suggestNextQueries": [
    "query impact src/index.ts to see who imports this file",
    "query chain src/index.ts to see dependency chain"
  ],
  "schemaVersion": "1.0",
  "meta": { /* ... */ }
}
```

### 4. Externals Query
**Purpose**: Find external package dependencies

**CLI Usage**:
```bash
kb mind query externals
kb mind query externals --scope packages/core --ai-mode
```

**Parameters**:
- `scope` (optional): Limit to specific package scope

**Response**:
```json
{
  "ok": true,
  "code": null,
  "query": "externals",
  "params": {},
  "result": {
    "externals": {
      "lodash": ["src/utils.ts", "src/helpers.ts"],
      "typescript": ["tsconfig.json"]
    },
    "count": 2
  },
  "summary": "Found 2 external package(s): lodash, typescript",
  "suggestNextQueries": [
    "query meta to see project overview",
    "query docs to see project documentation"
  ],
  "schemaVersion": "1.0",
  "meta": { /* ... */ }
}
```

### 5. Chain Query
**Purpose**: Show full dependency chain

**CLI Usage**:
```bash
kb mind query chain --file src/index.ts
kb mind query chain --file src/index.ts --depth 3 --ai-mode
```

**Parameters**:
- `file` (required): Starting file for the chain
- `depth` (optional): Maximum chain depth (default: 5)

**Response**:
```json
{
  "ok": true,
  "code": null,
  "query": "chain",
  "params": { "file": "src/index.ts" },
  "result": {
    "levels": [
      {
        "depth": 0,
        "files": ["src/index.ts"]
      },
      {
        "depth": 1,
        "files": ["src/services/core.ts", "src/config.ts"]
      }
    ],
    "visited": 3
  },
  "summary": "Dependency chain with 2 level(s), 3 file(s) visited. Root level: 1 file(s)",
  "suggestNextQueries": [
    "query impact src/index.ts to see who imports this file",
    "query exports src/index.ts to see what this file exports"
  ],
  "schemaVersion": "1.0",
  "meta": { /* ... */ }
}
```

### 6. Meta Query
**Purpose**: Project metadata and products

**CLI Usage**:
```bash
kb mind query meta
kb mind query meta --product core --ai-mode
```

**Parameters**:
- `product` (optional): Filter to specific product

**Response**:
```json
{
  "ok": true,
  "code": null,
  "query": "meta",
  "params": {},
  "result": {
    "project": "@test/project",
    "products": [
      {
        "id": "core",
        "name": "Core Package",
        "description": "Core business logic",
        "maintainers": ["team"],
        "tags": ["core", "business"],
        "dependencies": ["utils"]
      }
    ],
    "generatedAt": "2024-01-01T00:00:00.000Z"
  },
  "summary": "Project contains 1 product(s): core",
  "suggestNextQueries": [
    "query docs --type=adr to see architecture decisions",
    "query scope <product-path> to see dependencies"
  ],
  "schemaVersion": "1.0",
  "meta": { /* ... */ }
}
```

### 7. Docs Query
**Purpose**: Documentation files and content

**CLI Usage**:
```bash
kb mind query docs
kb mind query docs --type adr --ai-mode
kb mind query docs --search architecture --limit 5
```

**Parameters**:
- `type` (optional): Filter by document type (`adr`, `readme`, `guide`, `api`)
- `search` (optional): Search in document content
- `tag` (optional): Filter by document tags

**Response**:
```json
{
  "ok": true,
  "code": null,
  "query": "docs",
  "params": { "type": "adr" },
  "result": {
    "docs": [
      {
        "title": "Architecture Decision Record",
        "path": "docs/adr/0001-monorepo.md",
        "tags": ["architecture", "decision"],
        "summary": "Decision to use monorepo structure",
        "type": "adr"
      }
    ],
    "count": 1
  },
  "summary": "Found 1 documentation file(s): 1 ADR(s)",
  "suggestNextQueries": [
    "query meta to see project overview",
    "query exports <file> to see API exports"
  ],
  "schemaVersion": "1.0",
  "meta": { /* ... */ }
}
```

## CLI Flags

### Common Flags
- `--json`: Output in JSON format
- `--ai-mode`: Enable AI-friendly output with summaries and suggestions
- `--limit N`: Limit results to N items (default: 500)
- `--depth N`: Set maximum depth for chain/scope queries (default: 5)
- `--cache-mode ci|local`: Cache behavior (default: local)
- `--cache-ttl N`: Set cache TTL in seconds (default: 60)
- `--no-cache`: Disable caching (shorthand for cache-mode=ci)
- `--paths id|absolute`: Path representation mode (default: id)
- `--cwd PATH`: Set working directory
- `--quiet`: Suppress non-essential output
- `--verbose`: Enable verbose output

### Query-Specific Flags
- `--file PATH`: File path (required for impact, exports, chain)
- `--path PATH`: Directory path (required for scope)
- `--scope PATH`: Package scope (optional for externals)
- `--product ID`: Product ID (optional for meta)
- `--type TYPE`: Document type (optional for docs)
- `--search TEXT`: Search text (optional for docs)
- `--tag TAG`: Document tag (optional for docs)

## Response Format

### Success Response
```json
{
  "ok": true,
  "code": null,
  "query": "query_name",
  "params": { /* query parameters */ },
  "result": { /* query-specific result */ },
  "summary": "AI-friendly summary (ai-mode only)",
  "suggestNextQueries": ["suggestion1", "suggestion2"],
  "schemaVersion": "1.0",
  "meta": {
    "cwd": "/path/to/project",
    "queryId": "unique_query_id",
    "tokensEstimate": 150,
    "cached": false,
    "truncated": false,
    "filesScanned": 1,
    "edgesTouched": 25,
    "depsHash": "sha256_hash",
    "apiHash": "sha256_hash",
    "timingMs": {
      "load": 5,
      "filter": 12,
      "total": 17
    }
  },
  "paths": {
    "id1": "/absolute/path/to/file1.ts",
    "id2": "/absolute/path/to/file2.ts"
  }
}
```

### Error Response
```json
{
  "ok": false,
  "code": "MIND_QUERY_ERROR",
  "query": "query_name",
  "params": { /* query parameters */ },
  "result": null,
  "schemaVersion": "1.0",
  "meta": {
    "cwd": "/path/to/project",
    "queryId": "",
    "tokensEstimate": 0,
    "cached": false,
    "filesScanned": 0,
    "edgesTouched": 0,
    "depsHash": "",
    "apiHash": "",
    "timingMs": { "load": 0, "filter": 0, "total": 17 }
  }
}
```

## AI Mode Features

### Summaries
AI mode provides human-readable summaries for each query type:
- **Impact**: "Found X file(s) importing this module. Top: file1, file2"
- **Exports**: "X export(s) found: name1, name2"
- **Docs**: "Found X documentation file(s): Y ADR(s), Z guide(s)"
- **Meta**: "Project contains X product(s): id1, id2"
- **Externals**: "Found X external package(s): pkg1, pkg2"
- **Scope/Chain**: Brief summary with file counts and levels

### Query Suggestions
AI mode provides contextual suggestions for follow-up queries:
- **From impact**: suggests exports and chain queries
- **From meta**: suggests docs and scope queries
- **From exports**: suggests impact and chain queries
- **From docs**: suggests meta and specific file queries

### Token Optimization
- Path compression with stable IDs
- Configurable result limits
- Smart truncation with metadata
- 80-95% reduction vs full context

## Performance

### Targets
- **Cached queries**: < 20ms
- **Uncached queries**: < 60ms
- **Cache hit ratio**: > 80%

### Optimization Tips
- Use `--limit` to reduce payload size
- Enable `--ai-mode` for token-optimized output
- Use `--paths id` for path compression
- Cache frequently used queries

## Error Handling

### Common Error Codes
- `MIND_QUERY_NOT_FOUND`: Invalid query name
- `MIND_INVALID_FLAG`: Missing required parameters
- `MIND_FILE_NOT_FOUND`: Specified file doesn't exist
- `MIND_QUERY_ERROR`: General query execution error
- `MIND_CACHE_ERROR`: Cache operation failed

### Error Response Format
```json
{
  "ok": false,
  "code": "MIND_QUERY_ERROR",
  "query": "query_name",
  "params": { /* parameters */ },
  "result": null,
  "schemaVersion": "1.0",
  "meta": { /* minimal meta */ }
}
```

## Examples

### Basic Usage
```bash
# Get project overview
kb mind query meta --ai-mode

# Find who imports a file
kb mind query impact --file src/index.ts

# See what a file exports
kb mind query exports --file src/index.ts --ai-mode

# Find external dependencies
kb mind query externals --ai-mode
```

### Advanced Usage
```bash
# Chain queries with AI suggestions
kb mind query impact --file src/index.ts --ai-mode --json | jq '.suggestNextQueries'

# Scope analysis with depth limit
kb mind query scope --path packages/core --depth 2 --ai-mode

# Documentation search
kb mind query docs --search "architecture" --type adr --ai-mode

# Performance testing
time kb mind query meta --no-cache
time kb mind query meta  # Should be faster due to cache
```

### Programmatic Usage
```typescript
import { executeQuery } from '@kb-labs/mind-query';

const result = await executeQuery('impact', { file: 'src/index.ts' }, {
  cwd: process.cwd(),
  aiMode: true,
  limit: 100
});

console.log(result.summary);
console.log(result.suggestNextQueries);
```
