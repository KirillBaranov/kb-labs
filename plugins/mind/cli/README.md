# @kb-labs/mind-cli

CLI commands for KB Labs Mind.

## Vision & Purpose

**@kb-labs/mind-cli** provides CLI commands for KB Labs Mind. It includes commands for indexing, querying, packing, and verifying Mind indexes, plus REST handlers and Studio widgets.

### Core Goals

- **Indexing Commands**: Index codebase and update indexes
- **Query Commands**: Query Mind indexes
- **Pack Commands**: Build context packs
- **Verify Commands**: Verify Mind indexes
- **REST Handlers**: REST API handlers
- **Studio Widgets**: Studio widget implementations

## Package Status

- **Version**: 0.1.0
- **Stage**: Stable
- **Status**: Production Ready ✅

## Architecture

### High-Level Overview

```
Mind CLI
    │
    ├──► CLI Commands
    ├──► Application Layer
    ├──► Domain Layer
    ├──► Infrastructure Layer
    ├──► REST Handlers
    └──► Studio Widgets
```

### Key Components

1. **CLI Commands** (`cli/`): CLI command implementations
2. **Application Layer** (`application/`): Use cases and services
3. **Domain Layer** (`domain/`): Domain logic
4. **Infrastructure Layer** (`infra/`): Adapters and infrastructure
5. **REST Handlers** (`rest/`): REST API handlers
6. **Studio Widgets** (`studio/`): Studio widget implementations

## ✨ Features

- **Indexing Commands**: Index codebase and update indexes
- **Query Commands**: Query Mind indexes
- **Pack Commands**: Build context packs
- **Verify Commands**: Verify Mind indexes
- **REST Handlers**: REST API handlers
- **Studio Widgets**: Query and verify widgets for Studio

## 📦 API Reference

### Main Exports

#### CLI Commands

- `index`: Index codebase command
- `query`: Query Mind index command
- `pack`: Build context pack command
- `verify`: Verify Mind index command

#### Manifest

- `manifest`: Plugin manifest V2

## 🔧 Configuration

### Configuration Options

All configuration via CLI flags and kb-labs.config.json.

### CLI Flags

- `--json`: Output JSON format
- `--quiet`: Quiet mode
- `--verbose`: Verbose output

## 🔗 Dependencies

### Runtime Dependencies

- `@byjohann/toon` (`0.4.0`): Terminal UI library
- `@kb-labs/analytics-sdk-node` (`link:../../../kb-labs-analytics/packages/analytics-sdk-node`): Analytics SDK
- `@kb-labs/core` (`link:../../../kb-labs-core`): Core package
- `@kb-labs/plugin-manifest` (`link:../../../kb-labs-plugin/packages/manifest`): Plugin manifest
- `@kb-labs/plugin-adapter-studio` (`link:../../../kb-labs-plugin/packages/adapters/studio`): Studio adapter
- `@kb-labs/mind-contracts` (`link:../contracts`): Mind contracts
- `@kb-labs/mind-gateway` (`link:../mind-gateway`): Mind gateway
- `@kb-labs/mind-core` (`link:../mind-core`): Mind core
- `@kb-labs/mind-indexer` (`link:../mind-indexer`): Mind indexer
- `@kb-labs/mind-pack` (`link:../mind-pack`): Mind pack
- `@kb-labs/mind-query` (`link:../mind-query`): Mind query
- `@kb-labs/mind-types` (`link:../mind-types`): Mind types
- `@kb-labs/shared-cli-ui` (`link:../../../kb-labs-shared/packages/cli-ui`): Shared CLI UI
- `@tanstack/react-query` (`^5.0.0`): React Query
- `@aws-sdk/client-s3` (`^3.929.0`): AWS S3 client
- `ajv` (`^8.17.1`): JSON schema validation
- `ajv-formats` (`^3.0.1`): AJV formats
- `glob` (`^11.0.0`): File globbing
- `react` (`^18.0.0`): React
- `uuidv7` (`^1.0.0`): UUID v7 generation
- `yaml` (`^2.8.0`): YAML parsing
- `zod` (`^3.23.8`): Schema validation

### Development Dependencies

- `@kb-labs/devkit` (`link:../../../kb-labs-devkit`): DevKit presets
- `@types/node` (`^24.7.0`): Node.js types
- `@types/react` (`^18.3.18`): React types
- `tsup` (`^8.5.0`): TypeScript bundler
- `typescript` (`^5.6.3`): TypeScript compiler
- `vitest` (`^3.2.4`): Test runner

## 🧪 Testing

### Test Structure

```
src/__tests__/
└── (13 test files)
```

### Test Coverage

- **Current Coverage**: ~75%
- **Target Coverage**: 90%

## 📈 Performance

### Performance Characteristics

- **Time Complexity**: O(1) for command registration, O(n) for command execution
- **Space Complexity**: O(1)
- **Bottlenecks**: Indexing and query operations

## 🔒 Security

### Security Considerations

- **Input Validation**: Command input validation
- **Path Validation**: Path validation for file operations

### Known Vulnerabilities

- None

## 🐛 Known Issues & Limitations

### Known Issues

- None currently

### Limitations

## Breaking changes (no legacy compatibility)

- `runRagQuery` response field `knowledge` renamed to `result`.
- Runtime wrappers `createKnowledgeService/createKnowledgeEngineRegistry` removed from `mind-cli`.
- Config resolution now supports only `.kb/kb.config.json` and `kb.config.json` with `profiles[].products.mind` (or root `mind`).
- Legacy `knowledge.json` and top-level `knowledge` config are rejected.

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

### Example 1: Index Codebase

```bash
kb mind:index
```

### Example 2: Query Mind Index

```bash
kb mind:query --query impact --params '{"symbol":"MyFunction"}'
```

### Example 3: Build Context Pack

```bash
kb mind:pack --intent "Review this code change"
```

### Example 4: Verify Index

```bash
kb mind:verify
```

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## 📄 License

MIT © KB Labs
