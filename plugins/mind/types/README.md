# @kb-labs/mind-types

Shared types and contracts for KB Labs Mind.

## Vision & Purpose

**@kb-labs/mind-types** provides shared types and contracts for KB Labs Mind. It includes index types, query types, pack types, and error codes used across multiple Mind packages.

### Core Goals

- **Shared Types**: Type definitions used by multiple Mind packages
- **Index Types**: Mind index structure types
- **Query Types**: Query system types
- **Pack Types**: Context pack types

## Package Status

- **Version**: 0.1.0
- **Stage**: Stable
- **Status**: Production Ready ✅

## Architecture

### High-Level Overview

```
Mind Types
    │
    ├──► Index Types
    ├──► Query Types
    ├──► Pack Types
    └──► Error Codes
```

### Key Components

1. **Index Types**: Mind index structure types
2. **Query Types**: Query system types
3. **Pack Types**: Context pack types
4. **Error Codes**: Error code types

## ✨ Features

- **Index Types**: Mind index structure types (MindIndex, ApiIndex, DepsGraph, RecentDiff)
- **Query Types**: Query system types (QueryResult, QueryMeta, QueryName)
- **Pack Types**: Context pack types (ContextPackJson, PackOptions, PackResult)
- **Error Codes**: Error code types for unified error handling

## 📦 API Reference

### Main Exports

#### Index Types

- `MindIndex`: Mind index type
- `ApiIndex`: API index type
- `DepsGraph`: Dependency graph type
- `RecentDiff`: Recent diff type

#### Query Types

- `QueryResult`: Query result type
- `QueryMeta`: Query metadata type
- `QueryName`: Query name type

#### Pack Types

- `ContextPackJson`: Context pack JSON type
- `PackOptions`: Pack options type
- `PackResult`: Pack result type

#### Error Codes

- `MindErrorCode`: Error code type

## 🔧 Configuration

### Configuration Options

No configuration needed - pure type definitions.

## 🔗 Dependencies

### Runtime Dependencies

None (pure types)

### Development Dependencies

- `@kb-labs/devkit` (`link:../../../kb-labs-devkit`): DevKit presets
- `tsup` (`^8.5.0`): TypeScript bundler
- `typescript` (`^5.6.3`): TypeScript compiler

## 🧪 Testing

### Test Structure

No tests (types package).

### Test Coverage

- **Current Coverage**: N/A
- **Target Coverage**: N/A

## 📈 Performance

### Performance Characteristics

- **Time Complexity**: O(1) for type operations
- **Space Complexity**: O(1)
- **Bottlenecks**: None

## 🔒 Security

### Security Considerations

- **Type Safety**: TypeScript type safety

### Known Vulnerabilities

- None

## 🐛 Known Issues & Limitations

### Known Issues

- None currently

### Limitations

- **Type Definitions**: Fixed type definitions

### Future Improvements

- **More Types**: Additional type definitions

## 🔄 Migration & Breaking Changes

### Migration from Previous Versions

No breaking changes in current version (0.1.0).

### Breaking Changes in Future Versions

- None planned

## 📚 Examples

### Example 1: Use Index Types

```typescript
import type { MindIndex, ApiIndex } from '@kb-labs/mind-types';

const index: MindIndex = {
  schemaVersion: '1.0',
  generator: 'kb-labs-mind@0.1.0',
  updatedAt: new Date().toISOString(),
  root: '/path/to/repo',
  filesIndexed: 100,
  apiIndexHash: 'hash',
  depsHash: 'hash',
  recentDiffHash: 'hash',
  indexChecksum: 'hash',
};
```

### Example 2: Use Query Types

```typescript
import type { QueryResult, QueryName } from '@kb-labs/mind-types';

const result: QueryResult<unknown> = {
  ok: true,
  code: null,
  query: 'impact' as QueryName,
  params: {},
  result: {},
  meta: {
    cwd: '/path',
    queryId: 'id',
    tokensEstimate: 100,
    cached: false,
    filesScanned: 10,
    edgesTouched: 5,
    depsHash: 'hash',
    apiHash: 'hash',
    timingMs: { load: 10, filter: 5, total: 15 },
  },
};
```

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## 📄 License

MIT © KB Labs

