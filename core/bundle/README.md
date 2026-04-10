# @kb-labs/core-bundle

> **Facade package for KB Labs bundle system that orchestrates config, profiles, artifacts, and policy.** Single entry point (`loadBundle()`) for all KB Labs functionality, providing unified access to configuration, profiles, artifacts, and policy resolution.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18.18.0+-green.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9.0.0+-orange.svg)](https://pnpm.io/)

## 🎯 Vision & Purpose

**@kb-labs/core-bundle** is the orchestration facade that provides a single entry point for all KB Labs products. It coordinates configuration resolution, profile loading, artifact management, and policy enforcement into a unified `Bundle` object.

## 🏗️ Architecture

### Core Components

#### `loadBundle()` - Main Orchestration Function

- **Purpose**: Loads and orchestrates config, profiles, artifacts, and policy
- **Responsibilities**: 
  - Resolves workspace root
  - Loads and merges 6-layer configuration
  - Resolves profile (v1 or v2)
  - Creates artifacts wrapper
  - Resolves policy
  - Returns unified Bundle object
- **Dependencies**: `core-config`, `core-profiles`, `core-policy`, `core-sys`
- **Exports**: `Bundle<T>` interface

#### `explainBundle()` - Configuration Trace

- **Purpose**: Provides detailed trace of configuration resolution
- **Responsibilities**: 
  - Loads bundle (without side effects)
  - Returns configuration trace
- **Dependencies**: `loadBundle()` internally
- **Exports**: `MergeTrace[]` array

#### `initAll()` - Workspace Initialization

- **Purpose**: Initializes complete KB Labs workspace
- **Responsibilities**: 
  - Creates workspace config
  - Initializes profiles
  - Sets up policy
  - Creates lockfile
- **Dependencies**: `core-config`, `core-profiles`, `core-policy`
- **Exports**: `InitAllResult` with aggregated stats

#### Artifacts Wrapper

- **Purpose**: Provides lazy-loaded artifact access
- **Responsibilities**: 
  - Lists available artifacts
  - Materializes artifacts to filesystem
  - Reads artifact content (text/JSON)
- **Dependencies**: `core-profiles` for artifact loading
- **Exports**: Artifacts API in Bundle object

### Design Patterns

- **Facade Pattern**: Simplifies complex subsystem interactions
- **Lazy Loading**: Artifacts loaded on-demand
- **Builder Pattern**: `loadBundle()` builds complex Bundle object step-by-step
- **Strategy Pattern**: Supports multiple profile formats (v1/v2)

### Data Flow

```
User Code
    │
    ▼
loadBundle({ product, profileId, ... })
    │
    ├──► resolveWorkspaceRoot() → cwd
    ├──► readWorkspaceConfig() → workspace config
    ├──► resolveProfileV2() → profile
    ├──► getProductConfig() → merged config (6 layers)
    ├──► resolvePolicy() → policy rules
    ├──► createArtifactsWrapper() → artifacts API
    └──► return Bundle { config, profile, artifacts, policy, trace }
```

### State Management

- **State Type**: Local (per function call)
- **State Storage**: Memory (LRU cache for config/profile resolution)
- **State Lifecycle**: Created per `loadBundle()` call, cached for performance
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
- **Error Logging**: Structured logging via platform logger adapters

## 🚀 Quick Start

### Installation

```bash
pnpm add @kb-labs/core-bundle
```

### Basic Usage

```typescript
import { loadBundle } from '@kb-labs/core-bundle';

const bundle = await loadBundle({
  cwd: process.cwd(),
  product: 'aiReview'
});

// Access merged configuration
const config = bundle.config as AiReviewConfig;

// Access artifacts
const rules = await bundle.artifacts.list('rules');

// Check permissions
if (!bundle.policy.permits('aiReview.run')) {
  throw new Error('Permission denied');
}
```

## ✨ Features

- **Single Entry Point**: `loadBundle()` function for all KB Labs functionality
- **Orchestration**: Coordinates config, profiles, artifacts, and policy resolution
- **Lazy Loading**: Artifacts are loaded on-demand
- **Product Normalization**: Handles kebab-case (FS) ↔ camelCase (code) conversion
- **Trace Support**: Detailed configuration resolution trace
- **Error Handling**: Comprehensive error codes with helpful hints

## API

### Core Functions

```typescript
import { loadBundle, explainBundle, clearCaches, ProductId } from '@kb-labs/core-bundle';

// Load complete bundle
const bundle = await loadBundle({
  cwd: process.cwd(),
  product: 'aiReview',
  profileKey: 'default', // optional, defaults to 'default'
  cli: { debug: true },  // optional CLI overrides
  writeFinalConfig: true // optional, writes final config
});

// Explain configuration (trace only)
const trace = await explainBundle({
  cwd: process.cwd(),
  product: 'aiReview',
  profileKey: 'default'
});

// Clear all caches
clearCaches();
```

### Bundle Object

```typescript
interface Bundle {
  product: ProductId;           // Product identifier
  config: unknown;              // Resolved configuration
  profile: {                    // Profile information
    key: string;               // Profile key from workspace
    name: string;              // Profile name
    version: string;           // Profile version
    overlays?: string[];       // Profile overlays
  };
  artifacts: {                  // Artifact management
    summary: Record<string, string[]>; // Available artifacts by key
    list(key: string): Promise<Array<{ relPath: string; sha256: string }>>;
    materialize(keys?: string[]): Promise<{
      filesCopied: number;
      filesSkipped: number;
      bytesWritten: number;
    }>;
  };
  policy: {                     // Policy information
    bundle?: string;            // Policy bundle name
    permits: (action: string, resource?: any) => boolean;
  };
  trace: MergeTrace[];         // Configuration resolution trace
}
```

## Usage Examples

### Basic Bundle Loading

```typescript
import { loadBundle } from '@kb-labs/core-bundle';

const bundle = await loadBundle({
  cwd: process.cwd(),
  product: 'aiReview'
});

console.log('Product:', bundle.product);
console.log('Profile:', bundle.profile.name, bundle.profile.version);
console.log('Config:', bundle.config);
```

### Artifact Management

```typescript
// List available artifacts
const summary = bundle.artifacts.summary;
console.log('Available artifacts:', Object.keys(summary));

// List specific artifacts
const rules = await bundle.artifacts.list('rules');
console.log('Rule files:', rules.map(r => r.relPath));

// Materialize artifacts to .kb/<product>/
const result = await bundle.artifacts.materialize(['rules', 'prompts']);
console.log(`Materialized ${result.filesCopied} files`);
```

### Policy Checking

```typescript
// Check permissions
if (bundle.policy.permits('aiReview.run')) {
  await runAIReview();
} else {
  console.error('Permission denied');
}

// Check specific resource
if (bundle.policy.permits('profiles.materialize', 'ai-review')) {
  await bundle.artifacts.materialize();
}
```

### Configuration Trace

```typescript
// Explain configuration resolution
const trace = await explainBundle({
  cwd: process.cwd(),
  product: 'aiReview'
});

console.log('Configuration layers:');
trace.forEach(step => {
  console.log(`${step.layer}: ${step.path} = ${step.source}`);
});
```

## Product Support

The bundle system supports these products:

- `aiReview` - AI code review
- `aiDocs` - AI documentation
- `devlink` - Development linking
- `release` - Release management
- `devkit` - Development toolkit

## Error Handling

```typescript
import { KbError } from '@kb-labs/core-bundle';

try {
  const bundle = await loadBundle({ cwd, product: 'aiReview' });
} catch (error) {
  if (error instanceof KbError) {
    console.error(`Error: ${error.message}`);
    console.error(`Hint: ${error.hint}`);
    console.error(`Code: ${error.code}`);
  }
}
```

## Configuration Layers

The bundle system resolves configuration in this order:

1. **Runtime defaults** - Built-in defaults
2. **Profile defaults** - From profile manifest
3. **Preset defaults** - From org preset package
4. **Workspace config** - From `kb-labs.config.*`
5. **Local config** - From `.kb/<product>/<product>.config.json`
6. **CLI overrides** - From command line arguments

## Workspace Configuration

```yaml
# kb-labs.config.yaml
schemaVersion: "1.0"
profiles:
  default: "node-ts-lib@1.2.0"
  backend: "node-ts-lib@1.2.0"
$extends: "@kb-labs/org-preset@1.3.2"
policy:
  bundle: "default@1.0.0"
  overrides:
    rules:
      - action: "aiReview.run"
        allow: ["admin", "developer"]
products:
  ai-review:
    enabled: true
    rules: ["security", "performance"]
```

## Profile Structure

```json
{
  "$schema": "https://schemas.kb-labs.dev/profile/profile.schema.json",
  "schemaVersion": "1.0",
  "name": "node-ts-lib",
  "version": "1.2.0",
  "extends": ["@kb-labs/profile-base@^1.0.0"],
  "exports": {
    "ai-review": {
      "rules": "artifacts/ai-review/rules.yml",
      "prompts": "artifacts/ai-review/prompts/**"
    }
  },
  "defaults": {
    "ai-review": { "$ref": "./defaults/ai-review.json" }
  }
}
```

## Integration

The bundle system integrates with all KB Labs products:

```typescript
// In ai-review package
import { loadBundle } from '@kb-labs/core-bundle';

const bundle = await loadBundle({
  cwd: process.cwd(),
  product: 'aiReview'
});

// Use configuration
const config = bundle.config as AiReviewConfig;

// Read rules from artifacts
const rules = await bundle.artifacts.list('rules');
for (const rule of rules) {
  const content = await readArtifact(bundle.profile, rule.relPath);
  // Process rule content
}

// Check permissions
if (!bundle.policy.permits('aiReview.run')) {
  throw new Error('Permission denied');
}
```

## Caching

The bundle system uses LRU caching for performance:

```typescript
import { clearCaches } from '@kb-labs/core-bundle';

// Clear all caches (useful for tests)
clearCaches();
```

## Testing

```typescript
import { loadBundle, clearCaches } from '@kb-labs/core-bundle';

describe('My Test', () => {
  beforeEach(() => {
    clearCaches(); // Clear caches between tests
  });

  it('should load bundle', async () => {
    const bundle = await loadBundle({
      cwd: testDir,
      product: 'aiReview'
    });
    
    expect(bundle.product).toBe('aiReview');
    expect(bundle.profile.name).toBeDefined();
  });
});
```

## Initialization (Init System)

The bundle package also provides the `initAll()` function for workspace initialization.

### initAll()

Initialize a complete KB Labs workspace with configuration, profiles, policy, and lockfile:

```typescript
import { initAll } from '@kb-labs/core-bundle';

const result = await initAll({
  cwd: process.cwd(),
  format: 'yaml',                    // or 'json'
  products: ['aiReview'],            // products to set up
  profileKey: 'default',
  profileRef: 'node-ts-lib',         // npm package or local path
  presetRef: '@kb-labs/org-preset@^1.0.0', // optional
  scaffoldLocalProfile: true,        // create local profile scaffold
  policyBundle: 'default',           // optional
  dryRun: false,
  force: false,
});

// Result contains aggregated stats
console.log(`Created: ${result.stats.created}`);
console.log(`Updated: ${result.stats.updated}`);
console.log(`Skipped: ${result.stats.skipped}`);
console.log(`Conflicts: ${result.stats.conflicts}`);
```

### What Gets Created

Running `initAll()` with default options creates:

```
workspace/
├── kb-labs.config.yaml          # Workspace configuration
├── .kb/
│   ├── lock.json               # Lockfile with schema version
│   ├── profiles/
│   │   └── node-ts-lib/
│   │       ├── profile.json    # Profile manifest (new format)
│   │       ├── defaults/
│   │       │   └── ai-review.json
│   │       └── artifacts/
│   │           └── ai-review/
│   │               ├── rules.yml
│   │               └── prompts/
│   │                   └── review.md
│   └── ai-review/
│       └── ai-review.config.json  # Product-specific config
└── .gitignore                   # Updated with KB Labs entries
```

### Init Options

- **format**: `'yaml'` (default) or `'json'` - workspace config format
- **products**: Array of `ProductId` - which products to initialize (default: `['aiReview']`)
- **profileKey**: Profile key in workspace config (default: `'default'`)
- **profileRef**: Profile reference - npm package like `'@kb-labs/profile-node@^1.0.0'` or local path
- **scaffoldLocalProfile**: Create local profile scaffold (default: `false`)
- **presetRef**: Org preset to extend (optional)
- **policyBundle**: Policy bundle name (optional)
- **dryRun**: Preview changes without writing (default: `false`)
- **force**: Overwrite existing files (default: `false`)

### Idempotency

The init system is idempotent - running it multiple times with the same options will skip unchanged files:

```typescript
// First run - creates files
await initAll({ cwd, products: ['aiReview'], scaffoldLocalProfile: true });

// Second run - skips unchanged files
const result = await initAll({ cwd, products: ['aiReview'] });
console.log(result.stats.skipped); // > 0
```

### Dry Run

Preview what would be created without making changes:

```typescript
const result = await initAll({
  cwd: process.cwd(),
  products: ['aiReview'],
  scaffoldLocalProfile: true,
  dryRun: true,
});

// Check what would be created
result.workspace.actions.forEach(action => {
  console.log(`${action.kind}: ${action.path}`);
});
```

## 🔧 Configuration

### Configuration Options

Bundle uses the 6-layer configuration system from `@kb-labs/core-config`:

1. **Runtime defaults** - Built-in defaults
2. **Profile defaults** - From profile manifest
3. **Preset defaults** - From org preset package
4. **Workspace config** - From `kb-labs.config.*`
5. **Local config** - From `.kb/<product>/<product>.config.json`
6. **CLI overrides** - From command line arguments

### Environment Variables

- None (all configuration via files and options)

### Default Values

- `profileId`: Uses workspace default profile
- `scopeId`: Uses profile default scope
- `validate`: `false` (no validation)
- `writeFinalConfig`: `false` (doesn't write config)

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## 📄 License

KB Public License v1.1 © KB Labs
