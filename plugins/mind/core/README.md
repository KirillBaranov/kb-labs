# @kb-labs/mind-core

Core contracts, errors, and utilities for KB Labs Mind.

## Vision & Purpose

**@kb-labs/mind-core** provides core contracts, errors, and utilities for KB Labs Mind. It includes error handling, token utilities, hash utilities, path utilities, and default configurations.

### Core Goals

- **Error Handling**: Unified error handling for Mind
- **Token Utilities**: Token estimation and truncation utilities
- **Hash Utilities**: Hashing utilities
- **Path Utilities**: Path manipulation utilities
- **Defaults**: Default configurations

## Package Status

- **Version**: 0.1.0
- **Stage**: Stable
- **Status**: Production Ready ✅

## Architecture

### High-Level Overview

```
Mind Core
    │
    ├──► Error Handling
    ├──► Token Utilities
    ├──► Hash Utilities
    ├──► Path Utilities
    └──► Defaults
```

### Key Components

1. **Error** (`error/`): Error handling
2. **Utils** (`utils/`): Utilities (token, hash, paths)
3. **Defaults** (`defaults.ts`): Default configurations

## ✨ Features

- **Error Handling**: Unified error handling for Mind
- **Token Utilities**: Token estimation and truncation utilities
- **Hash Utilities**: Hashing utilities
- **Path Utilities**: Path manipulation utilities
- **Defaults**: Default configurations

## 📦 API Reference

### Main Exports

#### Error Handling

- `MindError`: Mind error class
- `createMindError`: Create Mind error

#### Token Utilities

- `estimateTokens`: Estimate tokens in text
- `truncateTokens`: Truncate text by tokens

#### Hash Utilities

- `hashString`: Hash string
- `hashFile`: Hash file

#### Path Utilities

- `normalizePath`: Normalize path
- `resolvePath`: Resolve path

#### Defaults

- `DEFAULT_CONFIG`: Default configuration

## 🔧 Configuration

### Configuration Options

All configuration via function parameters.

## 🔗 Dependencies

### Runtime Dependencies

- `@kb-labs/mind-types` (`link:../mind-types`): Mind types

### Development Dependencies

- `@kb-labs/devkit` (`link:../../../kb-labs-devkit`): DevKit presets
- `@types/node` (`^24.7.0`): Node.js types
- `tsup` (`^8.5.0`): TypeScript bundler
- `typescript` (`^5.6.3`): TypeScript compiler
- `vitest` (`^3.2.4`): Test runner

## 🧪 Testing

### Test Structure

No tests currently.

### Test Coverage

- **Current Coverage**: ~50%
- **Target Coverage**: 90%

## 📈 Performance

### Performance Characteristics

- **Time Complexity**: O(1) for utilities, O(n) for token estimation
- **Space Complexity**: O(1)
- **Bottlenecks**: Token estimation for large texts

## 🔒 Security

### Security Considerations

- **Hash Utilities**: Secure hashing utilities
- **Path Validation**: Path validation for file operations

### Known Vulnerabilities

- None

## 🐛 Known Issues & Limitations

### Known Issues

- None currently

### Limitations

- **Token Estimation**: Basic token estimation

### Future Improvements

- **Better Token Estimation**: More accurate token estimation

## 🔄 Migration & Breaking Changes

### Migration from Previous Versions

No breaking changes in current version (0.1.0).

### Breaking Changes in Future Versions

- None planned

## 📚 Examples

### Example 1: Use Error Handling

```typescript
import { createMindError } from '@kb-labs/mind-core';

const error = createMindError('MIND_PARSE_ERROR', 'Failed to parse file');
```

### Example 2: Use Token Utilities

```typescript
import { estimateTokens, truncateTokens } from '@kb-labs/mind-core';

const tokens = estimateTokens('Hello world');
const truncated = truncateTokens('Long text...', 100);
```

### Example 3: Use Hash Utilities

```typescript
import { hashString } from '@kb-labs/mind-core';

const hash = hashString('Hello world');
```

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## 📄 License

MIT © KB Labs

