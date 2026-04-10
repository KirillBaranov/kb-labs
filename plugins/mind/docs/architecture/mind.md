# KB Labs Mind Architecture

## Overview

KB Labs Mind is a headless context layer that provides intelligent code indexing, dependency tracking, and context pack generation for AI-powered development workflows. The system transforms codebases into structured, queryable knowledge graphs.

## Package Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    KB Labs Mind V1                          │
├─────────────────────────────────────────────────────────────┤
│  @kb-labs/mind-core     │ Core types, utilities, errors     │
│  @kb-labs/mind-indexer  │ Delta indexing & orchestration   │
│  @kb-labs/mind-query    │ AI-oriented query interface      │
│  @kb-labs/mind-cli      │ Command-line interface           │
│  @kb-labs/mind-types    │ Shared type definitions          │
│  @kb-labs/mind-pack     │ Context pack builder             │
│  @kb-labs/mind-adapters │ Git integration helpers          │
│  @kb-labs/mind-gateway  │ V2 HTTP handlers (preparation)   │
│  @kb-labs/mind-tests    │ Test suite & fixtures            │
└─────────────────────────────────────────────────────────────┘
```

## Layer Structure

### 1. Core Layer (`@kb-labs/mind-core`)
- **Purpose**: Foundation utilities and error handling
- **Key Components**:
  - `MindError` class with standardized error codes
  - Token estimation utilities (`estimateTokens`, `truncateToTokens`)
  - Hash utilities (`sha256`)
  - Path utilities (`toPosix`)
  - Default configurations and constants

### 2. Indexing Layer (`@kb-labs/mind-indexer`)
- **Purpose**: Delta indexing and orchestration
- **Key Components**:
  - `updateIndexes()` - Main indexing API
  - `orchestrateIndexing()` - Coordinates all indexers
  - Individual indexers: API, dependencies, docs, meta, diff
  - LRU cache for file resolution
  - Time budget enforcement

### 3. Query Layer (`@kb-labs/mind-query`)
- **Purpose**: AI-oriented query interface
- **Key Components**:
  - `executeQuery()` - Main query executor
  - Query implementations: impact, scope, exports, externals, chain, meta, docs
  - AI templates for deterministic summaries
  - Query cache with hash-based invalidation
  - Path registry for token optimization

### 4. CLI Layer (`@kb-labs/mind-cli`)
- **Purpose**: Command-line interface
- **Commands**:
  - `mind:init` - Initialize workspace
  - `mind:update` - Update indexes
  - `mind:query` - Execute queries
  - `mind:verify` - Verify index consistency
  - `mind:pack` - Generate context packs
  - `mind:feed` - Feed to AI tools

### 5. Gateway Layer (`@kb-labs/mind-gateway`)
- **Purpose**: V2 HTTP API preparation
- **Components**:
  - Pure handler functions (no framework dependencies)
  - Request/response type definitions
  - OpenAPI specification
  - Verify utilities

## Index File Formats

All index files are stored in `.kb/mind/` and follow consistent patterns:

### Main Index (`index.json`)
```json
{
  "schemaVersion": "1.0",
  "generator": "kb-labs-mind@0.1.0",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "root": "/path/to/project",
  "filesIndexed": 150,
  "apiIndexHash": "sha256_abc123",
  "depsHash": "sha256_def456",
  "recentDiffHash": "sha256_ghi789",
  "indexChecksum": "sha256_combined",
  "products": {
    "core": {
      "name": "Core Package",
      "modules": 25,
      "exportsCount": 45,
      "lastActivityAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

### API Index (`api-index.json`)
```json
{
  "schemaVersion": "1.0",
  "generator": "kb-labs-mind@0.1.0",
  "files": {
    "src/index.ts": {
      "exports": [
        {
          "name": "CoreService",
          "kind": "class",
          "signature": "class CoreService",
          "jsdoc": "Main service class"
        }
      ],
      "comments": ["Main entry point"],
      "size": 1024,
      "sha256": "sha256_file_hash"
    }
  }
}
```

### Dependencies Graph (`deps.json`)
```json
{
  "schemaVersion": "1.0",
  "generator": "kb-labs-mind@0.1.0",
  "root": "/path/to/project",
  "packages": {
    "@test/core": {
      "name": "@test/core",
      "version": "1.0.0",
      "dir": "packages/core"
    }
  },
  "edges": [
    {
      "from": "src/index.ts",
      "to": "src/services/core.ts",
      "type": "runtime",
      "imports": ["CoreService"]
    }
  ]
}
```

### Recent Diff (`recent-diff.json`)
```json
{
  "schemaVersion": "1.0",
  "generator": "kb-labs-mind@0.1.0",
  "since": "HEAD~1",
  "files": [
    {
      "path": "src/index.ts",
      "status": "M",
      "hunks": ["+export { newFunction }"],
      "size": 2048
    }
  ]
}
```

### Meta Index (`meta.json`)
```json
{
  "schemaVersion": "1.0",
  "generator": "kb-labs-mind@0.1.0",
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
}
```

### Docs Index (`docs.json`)
```json
{
  "schemaVersion": "1.0",
  "generator": "kb-labs-mind@0.1.0",
  "docs": [
    {
      "title": "Architecture Decision Record",
      "path": "docs/adr/0001-monorepo.md",
      "tags": ["architecture", "decision"],
      "summary": "Decision to use monorepo structure",
      "type": "adr"
    }
  ],
  "count": 5,
  "generatedAt": "2024-01-01T00:00:00.000Z"
}
```

## Checksum System

The checksum system ensures index consistency:

1. **Individual File Hashes**: Each index file has its own SHA256 hash
2. **Combined Checksum**: `indexChecksum` is SHA256 of all index files combined
3. **Conditional recentDiff**: recentDiff is only included in checksum if it has files (avoids volatility from empty diffs)
4. **Verification**: `mind:verify` command checks all hashes for consistency
5. **Cache Invalidation**: Query cache uses hashes for invalidation

### Checksum Computation
```typescript
interface ChecksumInput {
  apiIndex: ApiIndex;
  deps: DependencyGraph;
  meta: MetaIndex;
  docs: DocsIndex;
  recentDiff?: RecentDiff; // Only included if files exist
}

const hashInputs: ChecksumInput = {
  apiIndex: sortedApiIndex,
  deps: sortedDepsGraph,
  meta: sortedMeta,
  docs: sortedDocs
};

// Only include recentDiff if present (avoids checksum changes on empty diffs)
if (recentDiff?.files?.length > 0) {
  hashInputs.recentDiff = sortedDiff;
}

const indexChecksum = sha256(JSON.stringify(hashInputs));
```

## Query System Architecture

### Query Types
- **impact**: Find files that import a given module
- **scope**: Show dependencies within a path scope
- **exports**: List exports from a file
- **externals**: Find external package dependencies
- **chain**: Show full dependency chain
- **meta**: Project metadata and products
- **docs**: Documentation files and content

### AI Mode Features
- **Deterministic Summaries**: Template-based summaries for each query type
- **Query Suggestions**: Contextual suggestions for follow-up queries
- **Token Optimization**: Path compression and result limiting
- **Schema Versioning**: All responses include `schemaVersion: "1.0"`
- **Cache Modes**: `ci` (disabled for determinism) vs `local` (enabled with TTL)

### Cache Modes
- **`ci` mode**: Cache disabled, always fresh results (for deterministic CI)
- **`local` mode**: Cache enabled with hash-based invalidation and TTL (default)
- **Hash Invalidation**: Cache automatically invalidates when indexes change
- **TTL Support**: Configurable time-to-live (default: 60 seconds)

### Performance Targets
- **Cached Queries**: < 20ms
- **Uncached Queries**: < 60ms
- **Full Update Cycle**: < 800ms (default budget)
- **Cache Hit Ratio**: > 80%

## Deterministic Output

All outputs are deterministic through:
1. **Sorted Keys**: All JSON objects have sorted keys
2. **Stable Ordering**: Arrays are consistently ordered
3. **POSIX Paths**: All paths normalized to POSIX format
4. **Template-Based**: AI summaries use deterministic templates
5. **Hash-Based**: Consistent hashing for cache keys

## Error Handling

Centralized error handling with:
- **Standardized Codes**: `MIND_*` error codes
- **Structured Responses**: Consistent error format
- **Helpful Hints**: Actionable error messages
- **Fail-Open Philosophy**: Errors don't crash the system

## V2 Gateway Preparation

The gateway package provides:
- **Pure Functions**: No framework dependencies
- **Type Safety**: Full TypeScript definitions
- **OpenAPI Spec**: Complete API documentation
- **Handler Separation**: Query and verify handlers
- **Future-Ready**: Easy to mount in any HTTP framework
