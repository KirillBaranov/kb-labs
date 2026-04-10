# @kb-labs/mind-contracts

Public contracts for the KB Labs Mind plugin. Declares artifacts, commands, workflows, and API guarantees for consumers.

## Vision & Purpose

**@kb-labs/mind-contracts** provides public contracts for KB Labs Mind. It describes the guarantees that other products (CLI, Studio, REST gateway, Workflow Engine) can rely on without depending on Mind runtime code.

### Core Goals

- **Contract Definition**: Define public contracts for Mind
- **Schema Validation**: Zod schemas for validation
- **Type Safety**: TypeScript types derived from schemas
- **Versioning**: SemVer-based contract versioning

## Package Status

- **Version**: 0.1.0
- **Stage**: Stable
- **Status**: Production Ready ✅

## Architecture

### High-Level Overview

```
Mind Contracts
    │
    ├──► Contract Manifest
    ├──► Zod Schemas
    ├──► TypeScript Types
    └──► Helper Parsers
```

### Key Components

1. **Contract Manifest** (`contract.ts`): Plugin contracts manifest
2. **Schemas** (`schema/`): Zod validation schemas
3. **Types** (`types.ts`): TypeScript type definitions
4. **Parsers** (`schema.ts`): Helper parsers

## ✨ Features

- **Contract Manifest**: Typed declaration of Mind artifacts, commands, workflows, and REST routes
- **Zod Schemas**: Validation schemas for CLI flag definitions, query DTOs, REST responses, Studio widgets
- **TypeScript Types**: Type definitions for command inputs/outputs
- **Helper Parsers**: `parsePluginContracts` for runtime validation

## 📦 API Reference

### Main Exports

#### Contract Manifest

- `pluginContractsManifest`: Typed declaration of Mind artifacts, commands, workflows, and REST routes
- `contractsVersion`: SemVer version for contract coordination
- `contractsSchemaId`: Schema ID for contract validation

#### Schemas

- `parsePluginContracts`: Parse plugin contracts
- `pluginContractsSchema`: Plugin contracts schema

#### Types

- `PluginContracts`: Plugin contracts type
- `ArtifactDecl`: Artifact declaration type
- `CommandDecl`: Command declaration type

## 🔧 Configuration

### Configuration Options

No configuration needed - pure contract definitions.

## 🔗 Dependencies

### Runtime Dependencies

- `zod` (`^3.23.8`): Schema validation

### Development Dependencies

- `@kb-labs/devkit` (`link:../../../kb-labs-devkit`): DevKit presets
- `@types/node` (`^24.7.0`): Node.js types
- `semver` (`^7.6.3`): SemVer parsing
- `tsup` (`^8.5.0`): TypeScript bundler
- `typescript` (`^5.6.3`): TypeScript compiler
- `vitest` (`^3.2.4`): Test runner

## 🧪 Testing

### Test Structure

```
tests/
└── contracts.manifest.test.ts
```

### Test Coverage

- **Current Coverage**: ~70%
- **Target Coverage**: 90%

## 📈 Performance

### Performance Characteristics

- **Time Complexity**: O(1) for type operations, O(n) for schema validation
- **Space Complexity**: O(1)
- **Bottlenecks**: Schema validation for large payloads

## 🔒 Security

### Security Considerations

- **Schema Validation**: Input validation via Zod schemas
- **Type Safety**: TypeScript type safety

### Known Vulnerabilities

- None

## 🐛 Known Issues & Limitations

### Known Issues

- None currently

### Limitations

- **Schema Validation**: Basic validation only

### Future Improvements

- **Enhanced Validation**: More validation rules

## 🔄 Migration & Breaking Changes

### Versioning Rules

- **MAJOR** — breaking changes (removed fields, renamed IDs, incompatible schema updates)
- **MINOR** — backwards-compatible additions (new flags, artifacts, optional fields)
- **PATCH** — metadata/documentation tweaks that do not alter payload structure

### Breaking Changes in Future Versions

- None planned

## 📚 Examples

### Example 1: Use Contract Manifest

```typescript
import { pluginContractsManifest } from '@kb-labs/mind-contracts';

const queryArtifactId = pluginContractsManifest.artifacts['mind.query.json'].id;
```

### Example 2: Parse Plugin Contracts

```typescript
import { parsePluginContracts } from '@kb-labs/mind-contracts';

const contracts = parsePluginContracts(rawManifest);
```

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## 📄 License

MIT © KB Labs
