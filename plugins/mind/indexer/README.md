# @kb-labs/mind-indexer

Delta indexing for KB Labs Mind.

## Vision & Purpose

**@kb-labs/mind-indexer** provides delta indexing for KB Labs Mind. It includes index initialization, update operations, cache management, and TypeScript export extraction.

### Core Goals

- **Index Initialization**: Initialize Mind index structure
- **Index Updates**: Update indexes with delta changes
- **Cache Management**: LRU cache for index data
- **Export Extraction**: Extract TypeScript exports from files

## Package Status

- **Version**: 0.1.0
- **Stage**: Stable
- **Status**: Production Ready ✅

## Architecture

### High-Level Overview

```
Mind Indexer
    │
    ├──► Index Initialization
    ├──► Index Updates
    ├──► Cache Management
    ├──► Export Extraction
    └──► File System Utilities
```

### Key Components

1. **API** (`api/`): Index initialization and update APIs
2. **Indexers** (`indexers/`): Indexer implementations
3. **Cache** (`cache/`): LRU cache for index data
4. **Adapters** (`adapters/`): TypeScript export extractor
5. **FS** (`fs/`): File system utilities
6. **Orchestrator** (`orchestrator/`): Index orchestration

## ✨ Features

- **Index Initialization**: Initialize Mind index structure
- **Index Updates**: Update indexes with delta changes
- **Cache Management**: LRU cache for index data
- **Export Extraction**: Extract TypeScript exports from files
- **File System Utilities**: JSON read/write, hash computation

## 📦 API Reference

### Main Exports

#### Index Initialization

- `initMindStructure`: Initialize Mind index structure

#### Index Updates

- `updateIndexes`: Update indexes with delta changes

#### Cache

- `LRUCache`: LRU cache implementation
- `FileCache`: File-based cache

#### Export Extraction

- `TSExtractor`: TypeScript export extractor

#### File System

- `readJson`: Read JSON file
- `writeJson`: Write JSON file
- `computeJsonHash`: Compute JSON hash

## 🔧 Configuration

### Configuration Options

All configuration via function parameters.

## 🔗 Dependencies

### Runtime Dependencies

- `@kb-labs/mind-adapters` (`link:../mind-adapters`): Mind adapters
- `@kb-labs/mind-core` (`link:../mind-core`): Mind core
- `@kb-labs/mind-types` (`link:../mind-types`): Mind types
- `typescript` (`^5.6.3`): TypeScript compiler

### Development Dependencies

- `@kb-labs/devkit` (`link:../../../kb-labs-devkit`): DevKit presets
- `@types/node` (`^24.7.0`): Node.js types
- `tsup` (`^8.5.0`): TypeScript bundler
- `typescript` (`^5.6.3`): TypeScript compiler
- `vitest` (`^3.2.4`): Test runner

## 🧪 Testing

### Test Structure

```
src/__tests__/
└── (3 test files)
```

### Test Coverage

- **Current Coverage**: ~75%
- **Target Coverage**: 90%

## 📈 Performance

### Performance Characteristics

- **Time Complexity**: O(n) for indexing, O(1) for cache operations
- **Space Complexity**: O(n) where n = number of files
- **Bottlenecks**: Large codebase indexing

## 🔒 Security

### Security Considerations

- **Path Validation**: Path validation for file operations
- **File System**: Secure file system operations

### Known Vulnerabilities

- None

## 🐛 Known Issues & Limitations

### Known Issues

- None currently

### Limitations

- **Index Size**: Performance degrades with very large codebases
- **TypeScript Only**: Currently supports TypeScript only

### Future Improvements

- **More Languages**: Support for more languages
- **Performance**: Optimize for large codebases

## 🔄 Migration & Breaking Changes

### Migration from Previous Versions

No breaking changes in current version (0.1.0).

### Breaking Changes in Future Versions

- None planned

## 📚 Examples

### Example 1: Initialize Mind Structure

```typescript
import { initMindStructure } from '@kb-labs/mind-indexer';

await initMindStructure({
  cwd: process.cwd(),
});
```

### Example 2: Update Indexes

```typescript
import { updateIndexes } from '@kb-labs/mind-indexer';

const report = await updateIndexes({
  cwd: process.cwd(),
  since: 'HEAD~1',
});
```

### Example 3: Use Cache

```typescript
import { LRUCache } from '@kb-labs/mind-indexer';

const cache = new LRUCache<string, unknown>({ maxSize: 100 });
cache.set('key', value);
const value = cache.get('key');
```

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## 📄 License

MIT © KB Labs

