# @kb-labs/core-config

> **Core configuration system for KB Labs products with 6-layer merging, YAML/JSON support, and comprehensive tracing.** Provides deterministic configuration resolution with detailed merge traces for debugging.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18.18.0+-green.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9.0.0+-orange.svg)](https://pnpm.io/)

## 🎯 Vision & Purpose

**@kb-labs/core-config** is the foundation of KB Labs configuration system. It implements a sophisticated 6-layer configuration merging strategy that allows products to have defaults, profile overrides, preset configurations, workspace settings, local overrides, and CLI arguments - all merged deterministically with full traceability.

## 🏗️ Architecture

### Core Components

#### `getProductConfig()` - Main Configuration Resolver

- **Purpose**: Resolves product configuration by merging 6 layers
- **Responsibilities**: 
  - Find workspace root
  - Load workspace config
  - Resolve profile defaults
  - Load preset defaults
  - Load local config
  - Merge with CLI overrides
  - Return merged config with trace
- **Dependencies**: `core-types`, `yaml`, `zod`, `ajv`
- **Exports**: `ProductConfigResult<T>` with config and trace

#### `layeredMergeWithTrace()` - Merge Engine

- **Purpose**: Merges configuration layers with detailed tracing
- **Responsibilities**: 
  - Deep merge objects
  - Track merge operations
  - Generate merge trace
- **Dependencies**: None (pure function)
- **Exports**: `LayeredMergeResult` with merged config and trace

#### Profile Resolution System

- **Purpose**: Resolves Profiles v2 with scope selection
- **Responsibilities**: 
  - Load profile manifests
  - Resolve profile extends
  - Select scopes
  - Extract profile defaults
- **Dependencies**: `zod` for validation
- **Exports**: `resolveProfile()`, `selectProfileScope()`

### Design Patterns

- **Layered Architecture**: 6-layer configuration system
- **Strategy Pattern**: Different merge strategies for different layer types
- **Cache Pattern**: LRU cache for file system reads
- **Builder Pattern**: Configuration built layer by layer

### Data Flow

```
getProductConfig({ product, ... })
    │
    ├──► findNearestConfig() → workspace root
    ├──► readWorkspaceConfig() → workspace config
    ├──► resolveProfile() → profile defaults
    ├──► resolvePreset() → preset defaults
    ├──► readLocalConfig() → local config
    ├──► layeredMergeWithTrace() → merged config + trace
    └──► return { config, trace }
```

### State Management

- **State Type**: Local (per function call) + cached (LRU)
- **State Storage**: Memory (LRU cache for file reads)
- **State Lifecycle**: Created per call, cached for performance
- **State Persistence**: No persistence (stateless API)

### Concurrency Model

- **Single-threaded**: All operations are async but single-threaded
- **Thread Safety**: N/A (Node.js single-threaded event loop)
- **Race Conditions**: None (stateless API)
- **Deadlocks**: None

### Error Handling Strategy

- **Error Types**: `KbError` with error codes and hints
- **Error Propagation**: Errors thrown and caught by caller
- **Error Recovery**: No automatic recovery (caller must handle)
- **Error Logging**: Diagnostics array for non-fatal issues

## 🚀 Quick Start

### Installation

```bash
pnpm add @kb-labs/core-config
```

### Basic Usage

```typescript
import { getProductConfig } from '@kb-labs/core-config';

const result = await getProductConfig({
  cwd: process.cwd(),
  product: 'aiReview',
  cli: { debug: true }
}, schema);

console.log(result.config); // Merged configuration
console.log(result.trace);   // Detailed merge trace
```

## ✨ Features

- **YAML/JSON Support**: Automatic format detection and parsing
- **Find-up Resolution**: Walks up directory tree to find config files
- **Layered Merge**: Deterministic configuration merging with detailed trace
- **Product Normalization**: Consistent kebab-case (FS) ↔ camelCase (code) mapping
- **LRU Caching**: Filesystem read caching with invalidation
- **Error Handling**: Standardized errors with helpful hints
- **Schema Versioning**: All configs include `schemaVersion: "1.0"`

## API

### Core Functions

```typescript
import { 
  getProductConfig, 
  explainProductConfig, 
  readConfigFile,
  findNearestConfig,
  clearCaches 
} from '@kb-labs/core-config';

// Get product configuration with trace
const result = await getProductConfig({
  cwd: '/path/to/project',
  product: 'aiReview',
  cli: { debug: true }
}, schema);

console.log(result.config); // Merged configuration
console.log(result.trace);   // Detailed merge trace

// Explain configuration without resolving
const explanation = await explainProductConfig({
  cwd: '/path/to/project',
  product: 'aiReview'
}, schema);

// Read config file with format detection
const config = await readConfigFile('kb-labs.config.yaml');

// Find nearest config file
const { path, tried } = await findNearestConfig('/path/to/project');

// Clear caches (useful for tests)
clearCaches();
```

### Product Normalization

```typescript
import { toFsProduct, toConfigProduct, ProductId } from '@kb-labs/core-config';

// Convert to filesystem format
toFsProduct('aiReview'); // 'ai-review'
toFsProduct('aiDocs');   // 'ai-docs'

// Convert to code format
toConfigProduct('ai-review'); // 'aiReview'
toConfigProduct('ai-docs');   // 'aiDocs'
```

### Error Handling

```typescript
import { KbError, getExitCode } from '@kb-labs/core-config';

try {
  const config = await getProductConfig(opts, schema);
} catch (error) {
  if (error instanceof KbError) {
    console.error(error.message);
    console.error('Hint:', error.hint);
    process.exit(getExitCode(error));
  }
}
```

## Configuration Layers

The system merges configuration in this order (later layers override earlier ones):

1. **Runtime defaults** - Built-in defaults for each product
2. **Profile defaults** - From profile manifest defaults
3. **Preset defaults** - From org preset package
4. **Workspace config** - From `kb-labs.config.(json|yaml)`
5. **Local config** - From `.kb/<product>/<product>.config.json`
6. **CLI overrides** - From command line arguments

## Configuration Files

### Workspace Config (`kb-labs.config.yaml`)

```yaml
schemaVersion: "1.0"
profiles:
  default: "node-ts-lib@1.2.0"
  backend: "node-ts-lib@1.2.0"
products:
  ai-review:
    enabled: true
    rules: ["security", "performance"]
  devlink:
    watch: true
    build: true
```

### Local Config (`.kb/ai-review/ai-review.config.json`)

```json
{
  "$schema": "https://schemas.kb-labs.dev/config.schema.json",
  "schemaVersion": "1.0",
  "enabled": true,
  "rules": ["custom-rule"],
  "settings": {
    "debug": true
  }
}
```

## Error Codes

| Code | Exit Code | Description |
|------|-----------|-------------|
| `ERR_CONFIG_NOT_FOUND` | 2 | Config file not found |
| `ERR_CONFIG_INVALID` | 1 | Invalid config syntax |
| `ERR_PRESET_NOT_RESOLVED` | 1 | Preset package not found |
| `ERR_PROFILE_INCOMPATIBLE` | 1 | Profile version incompatible |

## Caching

The system uses LRU caching for filesystem reads:

- **Key**: `absPath|mtime|size`
- **Max Size**: 100 entries
- **Invalidation**: Automatic on file change
- **Clear**: Use `clearCaches()` for tests

## Examples

### Basic Usage

```typescript
import { getProductConfig } from '@kb-labs/core-config';

const config = await getProductConfig({
  cwd: process.cwd(),
  product: 'aiReview',
  cli: { debug: true }
}, aiReviewSchema);

console.log('AI Review config:', config.config);
console.log('Merge trace:', config.trace);
```

### CLI Integration

```typescript
import { getProductConfig, KbError, getExitCode } from '@kb-labs/core-config';

try {
  const result = await getProductConfig({
    cwd: process.cwd(),
    product: 'aiReview',
    cli: cliArgs
  }, schema);
  
  console.log(JSON.stringify(result.config, null, 2));
} catch (error) {
  if (error instanceof KbError) {
    console.error(`Error: ${error.message}`);
    if (error.hint) {
      console.error(`Hint: ${error.hint}`);
    }
    process.exit(getExitCode(error));
  }
  throw error;
}
```

### Testing

```typescript
import { clearCaches } from '@kb-labs/core-config';

beforeEach(() => {
  clearCaches(); // Clear caches between tests
});
```

## 🔧 Configuration

### Configuration Options

The 6-layer configuration system:

1. **Runtime defaults** - Built-in defaults for each product
2. **Profile defaults** - From profile manifest defaults
3. **Preset defaults** - From org preset package (`$extends`)
4. **Workspace config** - From `kb-labs.config.(json|yaml)`
5. **Local config** - From `.kb/<product>/<product>.config.json`
6. **CLI overrides** - From command line arguments

### Environment Variables

- None (all configuration via files and options)

### Default Values

- **Cache Size**: 100 entries (LRU)
- **Config Format**: Auto-detected (YAML/JSON)
- **Schema Version**: "1.0"

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## 📄 License

KB Public License v1.1 © KB Labs
