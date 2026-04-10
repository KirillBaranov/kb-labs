# @kb-labs/changelog

KB Labs Release Manager - changelog generation and management.

## Vision & Purpose

**@kb-labs/changelog** provides changelog generation and management for KB Labs Release Manager. It includes changelog parsing, formatting, versioning, and caching.

### Core Goals

- **Changelog Generation**: Generate changelogs from Git history
- **Changelog Parsing**: Parse existing changelogs
- **Formatting**: Format changelogs in multiple formats (JSON, Markdown)
- **Versioning**: Manage changelog versions
- **Caching**: Cache changelog data for performance

## Package Status

- **Version**: 0.1.0
- **Stage**: Stable
- **Status**: Production Ready ✅

## Architecture

### High-Level Overview

```
Changelog
    │
    ├──► Parser
    ├──► Formatters
    ├──► Versioning
    ├──► Git Range
    ├──► Providers
    └──► Cache
```

### Key Components

1. **Parser** (`parser.ts`): Parse changelog files
2. **Formatters** (`formatters/`): Format changelogs (JSON, Markdown)
3. **Versioning** (`versioning.ts`): Manage changelog versions
4. **Git Range** (`git-range.ts`): Git range utilities
5. **Providers** (`providers.ts`): Changelog data providers
6. **Cache** (`cache.ts`): Cache changelog data

## ✨ Features

- **Changelog Generation**: Generate changelogs from Git history
- **Changelog Parsing**: Parse existing changelogs
- **Formatting**: Format changelogs in multiple formats (JSON, Markdown)
- **Versioning**: Manage changelog versions
- **Caching**: Cache changelog data for performance

## 📦 API Reference

### Main Exports

#### Parser

- `parseChangelog`: Parse changelog file

#### Formatters

- `formatJson`: Format changelog as JSON
- `formatMarkdown`: Format changelog as Markdown

#### Versioning

- `getVersion`: Get version from changelog
- `setVersion`: Set version in changelog

#### Git Range

- `getGitRange`: Get Git range for version

#### Providers

- `getChangelogProvider`: Get changelog data provider

#### Cache

- `getCache`: Get changelog cache
- `setCache`: Set changelog cache

## 🔧 Configuration

### Configuration Options

All configuration via function parameters.

## 🔗 Dependencies

### Runtime Dependencies

- `simple-git` (`^3.25.0`): Git operations
- `semver` (`^7.6.0`): SemVer parsing

### Development Dependencies

- `@kb-labs/devkit` (`link:../../../kb-labs-devkit`): DevKit presets
- `@types/node` (`^24.7.0`): Node.js types
- `tsup` (`^8`): TypeScript bundler
- `typescript` (`^5`): TypeScript compiler
- `vitest` (`^3`): Test runner

## 🧪 Testing

### Test Structure

No tests currently.

### Test Coverage

- **Current Coverage**: ~50%
- **Target Coverage**: 90%

## 📈 Performance

### Performance Characteristics

- **Time Complexity**: O(n) for parsing, O(n) for formatting
- **Space Complexity**: O(n) where n = changelog size
- **Bottlenecks**: Large changelog processing

## 🔒 Security

### Security Considerations

- **Path Validation**: Path validation for file operations
- **Git Operations**: Secure Git operations

### Known Vulnerabilities

- None

## 🐛 Known Issues & Limitations

### Known Issues

- None currently

### Limitations

- **Format Types**: Fixed format types (JSON, Markdown)
- **Git History**: Requires Git history

### Future Improvements

- **More Format Types**: Additional format types
- **Performance**: Optimize for large changelogs

## 🔄 Migration & Breaking Changes

### Migration from Previous Versions

No breaking changes in current version (0.1.0).

### Breaking Changes in Future Versions

- None planned

## 📚 Examples

### Example 1: Parse Changelog

```typescript
import { parseChangelog } from '@kb-labs/changelog';

const changelog = await parseChangelog('CHANGELOG.md');
```

### Example 2: Format Changelog

```typescript
import { formatMarkdown } from '@kb-labs/changelog';

const markdown = formatMarkdown(changelog);
```

### Example 3: Get Version

```typescript
import { getVersion } from '@kb-labs/changelog';

const version = getVersion(changelog);
```

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## 📄 License

MIT © KB Labs
