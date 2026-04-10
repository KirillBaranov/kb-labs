# @kb-labs/mind-adapters

Git adapters for KB Labs Mind.

## Vision & Purpose

**@kb-labs/mind-adapters** provides Git adapters for KB Labs Mind. It includes adapters for Git diff and staged file operations.

### Core Goals

- **Git Diff**: Get Git diff since a specific revision
- **Staged Files**: List staged files in Git repository

## Package Status

- **Version**: 0.1.0
- **Stage**: Stable
- **Status**: Production Ready ✅

## Architecture

### High-Level Overview

```
Mind Adapters
    │
    ├──► Git Diff
    └──► Staged Files
```

### Key Components

1. **Git Diff** (`git/diff.ts`): Get Git diff since revision
2. **Staged Files** (`git/staged.ts`): List staged files

## ✨ Features

- **Git Diff**: Get Git diff since a specific revision
- **Staged Files**: List staged files in Git repository

## 📦 API Reference

### Main Exports

#### Git Diff

- `gitDiffSince`: Get Git diff since a specific revision

#### Staged Files

- `listStagedFiles`: List staged files in Git repository

## 🔧 Configuration

### Configuration Options

All configuration via function parameters.

## 🔗 Dependencies

### Runtime Dependencies

- `@kb-labs/mind-core` (`link:../mind-core`): Mind core

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
└── git.spec.ts
```

### Test Coverage

- **Current Coverage**: ~70%
- **Target Coverage**: 90%

## 📈 Performance

### Performance Characteristics

- **Time Complexity**: O(n) for diff operations, O(n) for staged file listing
- **Space Complexity**: O(n) where n = diff size
- **Bottlenecks**: Large diff processing

## 🔒 Security

### Security Considerations

- **Git Operations**: Secure Git operations
- **Path Validation**: Path validation for file operations

### Known Vulnerabilities

- None

## 🐛 Known Issues & Limitations

### Known Issues

- None currently

### Limitations

- **Git Operations**: Requires Git repository
- **Diff Size**: Performance degrades with very large diffs

### Future Improvements

- **Performance**: Optimize for large diffs
- **More Git Operations**: Additional Git operations

## 🔄 Migration & Breaking Changes

### Migration from Previous Versions

No breaking changes in current version (0.1.0).

### Breaking Changes in Future Versions

- None planned

## 📚 Examples

### Example 1: Get Git Diff

```typescript
import { gitDiffSince } from '@kb-labs/mind-adapters';

const diff = await gitDiffSince({
  cwd: process.cwd(),
  since: 'HEAD~1',
});
```

### Example 2: List Staged Files

```typescript
import { listStagedFiles } from '@kb-labs/mind-adapters';

const files = await listStagedFiles({
  cwd: process.cwd(),
});
```

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## 📄 License

MIT © KB Labs

