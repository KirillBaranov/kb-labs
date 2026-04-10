# @kb-labs/release-cli

KB Labs Release Manager - CLI commands for release management.

## Vision & Purpose

**@kb-labs/release-cli** provides CLI commands for KB Labs Release Manager. It includes commands for planning, running, verifying, previewing, reporting, rolling back releases, and generating changelogs.

### Core Goals

- **Plan Command**: Plan release with versioning
- **Run Command**: Run complete release process
- **Verify Command**: Verify release readiness
- **Preview Command**: Preview release plan
- **Report Command**: Generate release report
- **Rollback Command**: Rollback failed release
- **Changelog Command**: Generate changelog

## Package Status

- **Version**: 0.1.0
- **Stage**: Stable
- **Status**: Production Ready ✅

## Architecture

### High-Level Overview

```
Release CLI
    │
    ├──► CLI Commands
    ├──► Manifest Definition
    ├──► REST Handlers
    └──► Analytics Integration
```

### Key Components

1. **Commands** (`commands/`): CLI command implementations
2. **Manifest** (`manifest.v2.ts`): Plugin manifest definition
3. **REST Handlers** (`rest/handlers/`): REST API handlers
4. **Analytics** (`analytics/`): Analytics event tracking

## ✨ Features

- **Plan command** for planning releases
- **Run command** for running releases
- **Verify command** for verifying release readiness
- **Preview command** for previewing release plans
- **Report command** for generating reports
- **Rollback command** for rolling back releases
- **Changelog command** for generating changelogs
- **REST handlers** for API integration

## 📦 API Reference

### Main Exports

#### Commands

- `plan`: Plan release command
- `run`: Run release command
- `verify`: Verify release command
- `preview`: Preview release command
- `report`: Report command
- `rollback`: Rollback command
- `changelog`: Changelog command

#### Manifest

- `manifest`: Plugin manifest V2
- `commands`: CLI commands manifest

## 🔧 Configuration

### Configuration Options

All configuration via CLI flags and kb-labs.config.json.

### CLI Flags

- `--json`: Output JSON format
- `--quiet`: Quiet mode
- `--verbose`: Verbose output

## 🔗 Dependencies

### Runtime Dependencies

- `@kb-labs/analytics-sdk-node` (`link:../../../kb-labs-analytics/packages/analytics-sdk-node`): Analytics SDK
- `@kb-labs/release-core` (`link:../release-core`): Release core
- `@kb-labs/release-checks` (`link:../release-checks`): Release checks
- `@kb-labs/changelog` (`link:../changelog`): Changelog package
- `@kb-labs/cli-core` (`link:../../../kb-labs-cli/packages/core`): CLI core
- `@kb-labs/cli-commands` (`link:../../../kb-labs-cli/packages/commands`): CLI commands
- `@kb-labs/shared-cli-ui` (`link:../../../kb-labs-shared/packages/cli-ui`): Shared CLI UI
- `@kb-labs/core` (`link:../../../kb-labs-core`): Core package
- `@kb-labs/core-bundle` (`link:../../../kb-labs-core/packages/bundle`): Bundle package
- `@kb-labs/plugin-manifest` (`link:../../../kb-labs-plugin/packages/manifest`): Plugin manifest
- `@aws-sdk/client-s3` (`^3.676.0`): AWS S3 client
- `ajv` (`^8.17.1`): JSON schema validation
- `ajv-formats` (`^3.0.1`): AJV formats
- `glob` (`^10.3.10`): File globbing
- `globby` (`^11.0.0`): File pattern matching
- `semver` (`^7.6.0`): SemVer parsing
- `simple-git` (`^3.25.0`): Git operations
- `uuidv7` (`^0.6.1`): UUID v7 generation
- `yaml` (`^2.8.0`): YAML parsing
- `zod` (`^4.1.5`): Schema validation

### Development Dependencies

- `@kb-labs/devkit` (`link:../../../kb-labs-devkit`): DevKit presets
- `@types/node` (`^24.7.0`): Node.js types
- `tsup` (`^8`): TypeScript bundler
- `typescript` (`^5`): TypeScript compiler
- `vitest` (`^3`): Test runner

## 🧪 Testing

### Test Structure

```
src/__tests__/
└── manifest.v2.spec.ts
```

### Test Coverage

- **Current Coverage**: ~50%
- **Target Coverage**: 90%

## 📈 Performance

### Performance Characteristics

- **Time Complexity**: O(1) for command registration, O(n) for command execution
- **Space Complexity**: O(1)
- **Bottlenecks**: Release operations

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

- **Command Types**: Fixed command types
- **Output Formats**: Fixed output formats

### Future Improvements

- **More Commands**: Additional commands
- **Custom Output Formats**: Custom output format support

## 🔄 Migration & Breaking Changes

### Migration from Previous Versions

No breaking changes in current version (0.1.0).

### Breaking Changes in Future Versions

- None planned

## 📚 Examples

### Example 1: Plan Release

```bash
kb release:plan
```

### Example 2: Run Release

```bash
kb release:run
```

### Example 3: Verify Release

```bash
kb release:verify
```

### Example 4: Generate Changelog

```bash
kb release:changelog
```

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## 📄 License

MIT © KB Labs
