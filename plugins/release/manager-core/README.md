# @kb-labs/release-core

KB Labs Release Manager - core orchestration, planning, versioning, and publishing.

## Vision & Purpose

**@kb-labs/release-core** provides core orchestration for KB Labs Release Manager. It includes planning, versioning, publishing, rollback, and reporting functionality.

### Core Goals

- **Release Planning**: Plan releases with versioning and dependency analysis
- **Version Management**: Manage version numbers and changelogs
- **Publishing**: Publish packages to registries
- **Rollback**: Rollback failed releases
- **Reporting**: Generate release reports

## Package Status

- **Version**: 0.1.0
- **Stage**: Stable
- **Status**: Production Ready ✅

## Architecture

### High-Level Overview

```
Release Core
    │
    ├──► Planner
    ├──► Publisher
    ├──► Rollback
    ├──► Runner
    └──► Reporters
```

### Key Components

1. **Planner** (`planner.ts`): Plan releases with versioning
2. **Publisher** (`publisher.ts`): Publish packages to registries
3. **Rollback** (`rollback.ts`): Rollback failed releases
4. **Runner** (`runner.ts`): Run release process
5. **Reporters** (`reporters/`): Generate release reports (JSON, Markdown, Text)
6. **Config** (`config.ts`): Configuration management

## ✨ Features

- **Release Planning**: Plan releases with versioning and dependency analysis
- **Version Management**: Manage version numbers and changelogs
- **Publishing**: Publish packages to registries
- **Rollback**: Rollback failed releases
- **Reporting**: Generate release reports in multiple formats

## 📦 API Reference

### Main Exports

#### Planner

- `planRelease`: Plan release with versioning

#### Publisher

- `publishRelease`: Publish packages to registries

#### Rollback

- `rollbackRelease`: Rollback failed release

#### Runner

- `runRelease`: Run complete release process

#### Reporters

- `renderJson`: Render JSON report
- `renderMarkdown`: Render Markdown report
- `renderText`: Render text report

## 🔧 Configuration

### Configuration Options

All configuration via function parameters and kb-labs.config.json.

## 🔗 Dependencies

### Runtime Dependencies

- `@kb-labs/core` (`link:../../../kb-labs-core`): Core package
- `@kb-labs/core-bundle` (`link:../../../kb-labs-core/packages/bundle`): Bundle package
- `@kb-labs/changelog` (`link:../changelog`): Changelog package
- `execa` (`^8.0.0`): Process execution
- `fs-extra` (`^11.0.0`): File system utilities
- `globby` (`^11.0.0`): File pattern matching
- `semver` (`^7.6.0`): SemVer parsing
- `simple-git` (`^3.25.0`): Git operations
- `yaml` (`^2.8.0`): YAML parsing

### Development Dependencies

- `@kb-labs/devkit` (`link:../../../kb-labs-devkit`): DevKit presets
- `@types/fs-extra` (`^11.0.0`): fs-extra types
- `@types/node` (`^24.7.0`): Node.js types
- `@types/semver` (`^7.5.0`): SemVer types
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

- **Time Complexity**: O(n) for planning, O(n) for publishing
- **Space Complexity**: O(n) where n = number of packages
- **Bottlenecks**: Publishing operations

## 🔒 Security

### Security Considerations

- **Registry Authentication**: Secure registry authentication
- **Path Validation**: Path validation for file operations

### Known Vulnerabilities

- None

## 🐛 Known Issues & Limitations

### Known Issues

- None currently

### Limitations

- **Registry Types**: Fixed registry types
- **Report Formats**: Fixed report formats

### Future Improvements

- **More Registry Types**: Additional registry types
- **Custom Report Formats**: Custom report format support

## 🔄 Migration & Breaking Changes

### Migration from Previous Versions

No breaking changes in current version (0.1.0).

### Breaking Changes in Future Versions

- None planned

## 📚 Examples

### Example 1: Plan Release

```typescript
import { planRelease } from '@kb-labs/release-core';

const plan = await planRelease({
  packages: ['@kb-labs/core', '@kb-labs/cli'],
  version: '1.0.0',
});
```

### Example 2: Publish Release

```typescript
import { publishRelease } from '@kb-labs/release-core';

await publishRelease(plan, {
  registry: 'npm',
  access: 'public',
});
```

### Example 3: Generate Report

```typescript
import { renderMarkdown } from '@kb-labs/release-core';

const markdown = renderMarkdown(releaseResult);
```

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## 📄 License

MIT © KB Labs
