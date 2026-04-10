# KB Labs v0.2 Core: Bundle System Overview

## Architecture

The KB Labs v0.2 Core system provides a unified configuration management system through the `@kb-labs/core-bundle` facade package. This system orchestrates configuration, profiles, artifacts, and policy management across all KB Labs products.

### Core Components

- **`@kb-labs/core-config`** - Configuration management with layered merging and tracing
- **`@kb-labs/core-profiles`** - Profile management with artifacts and defaults
- **`@kb-labs/core-policy`** - RBAC-style permission system
- **`@kb-labs/core-bundle`** - Facade orchestrating all components

### Product Support

The system supports the following products:
- `aiReview` - AI code review tool
- `aiDocs` - AI documentation generator
- `devlink` - Development linking tool
- `release` - Release management
- `devkit` - Development toolkit

## Configuration Layers

The system uses a layered configuration approach with the following precedence (later layers override earlier ones):

1. **Runtime defaults** - Built-in defaults for each product
2. **Profile defaults** - Product-specific defaults from profiles
3. **Org preset** - Organization-wide defaults from `$extends`
4. **Workspace config** - Project-level configuration
5. **Local config** - User-specific overrides
6. **CLI overrides** - Command-line arguments

### Layer Examples

#### Runtime Defaults
```typescript
// Built into each product
const runtimeDefaults = {
  aiReview: {
    rules: [],
    prompts: [],
    maxFiles: 100
  }
};
```

#### Profile Defaults
```yaml
# profiles/node-ts-lib/profile.json
{
  "schemaVersion": "1.0",
  "name": "node-ts-lib",
  "version": "1.2.0",
  "defaults": {
    "ai-review": {
      "$ref": "./defaults/ai-review.json"
    }
  }
}
```

#### Org Preset
```yaml
# kb-labs.config.yaml
{
  "$extends": "@kb-labs/org-preset@^1.0.0",
  "profiles": {
    "default": "node-ts-lib@1.2.0"
  }
}
```

#### Workspace Config
```yaml
# kb-labs.config.yaml
{
  "schemaVersion": "1.0",
  "profiles": {
    "default": "node-ts-lib@1.2.0",
    "production": "node-ts-lib@1.2.0"
  },
  "products": {
    "ai-review": {
      "rules": ["custom-rules.yml"],
      "maxFiles": 50
    }
  }
}
```

#### Local Config
```yaml
# .kb/ai-review/ai-review.config.yaml
{
  "schemaVersion": "1.0",
  "rules": ["local-rules.yml"],
  "maxFiles": 25
}
```

#### CLI Overrides
```bash
kb ai-review --maxFiles=10 --rules=./custom-rules.yml
```

## Profile System

### Profile Manifest Format

Profiles use a new `profile.json` format with schema versioning:

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
    "ai-review": {
      "$ref": "./defaults/ai-review.json"
    }
  }
}
```

> ⚠️ **Schema validation временно отключена.** Пакет `@kb-labs/profile-schemas` удалён из монорепы. `validateProfile()` и продуктовые валидаторы пока выполняют только минимальные проверки (`schemaVersion === "1.0"`); полноценный валидатор появится вместе с новым registry.

### Profile Resolution

Profiles can be referenced in several ways:
- `name@1.2.0` - Exact version
- `name@^1.2` - Semantic version range
- `./relative/path` - Local path

### Artifact Management

Profiles can export artifacts (files) that are made available to products:

```typescript
// List artifacts for a product
const artifacts = await bundle.artifacts.list('rules');

// Materialize artifacts to local cache
const result = await bundle.artifacts.materialize(['rules', 'prompts']);
```

### Security

Artifact access is secured with:
- **Format whitelist**: Only `yml`, `yaml`, `md`, `txt`, `json` files
- **Path sanitization**: No `..` escapes beyond profile root
- **Size limits**: 1MB per file, 100 files per key
- **SHA256 verification**: All artifacts are verified by hash

## Policy System

### RBAC Permissions

The policy system provides role-based access control:

```typescript
// Check permissions
const canRun = bundle.policy.permits('aiReview.run');
const canPublish = bundle.policy.permits('release.publish');
```

### Base Actions

- `aiReview.run` - Run AI review
- `release.publish` - Publish releases
- `devkit.sync` - Sync development tools
- `devlink.watch` - Watch for changes
- `profiles.materialize` - Materialize profile artifacts

### Policy Configuration

```yaml
# kb-labs.config.yaml
{
  "policy": {
    "overrides": {
      "roles": {
        "developer": ["aiReview.run", "devkit.sync"],
        "maintainer": ["release.publish", "profiles.materialize"]
      }
    }
  }
}
```

## Bundle API

### Loading a Bundle

```typescript
import { loadBundle } from '@kb-labs/core-bundle';

const bundle = await loadBundle({
  cwd: process.cwd(),
  product: 'aiReview',
  profileKey: 'default'
});
```

### Bundle Structure

```typescript
interface Bundle {
  product: ProductId;
  config: unknown;
  profile: {
    key: string;
    name: string;
    version: string;
    overlays?: string[];
  };
  artifacts: {
    summary: Record<string, string[]>;
    list(key: string): Promise<Array<{relPath: string; sha256: string}>>;
    materialize(keys?: string[]): Promise<{
      filesCopied: number;
      filesSkipped: number;
      bytesWritten: number;
    }>;
  };
  policy: {
    bundle?: string;
    permits: (action: string, resource?: any) => boolean;
  };
  trace: MergeTrace[];
}
```

### Explaining Configuration

```typescript
import { explainBundle } from '@kb-labs/core-bundle';

const trace = await explainBundle({
  cwd: process.cwd(),
  product: 'aiReview',
  profileKey: 'default'
});
```

## CLI Commands

### Bundle Print

```bash
# Human-readable output
kb bundle print --product=aiReview

# JSON output
kb bundle print --product=aiReview --json

# Specific profile
kb bundle print --product=aiReview --profile=production
```

### Bundle Explain

```bash
# Show configuration resolution
kb bundle explain --product=aiReview

# Specific profile
kb bundle explain --product=aiReview --profile=production
```

## Error Handling

### Error Codes

- `ERR_CONFIG_NOT_FOUND` (exit 2) - Configuration file not found
- `ERR_FORBIDDEN` (exit 3) - Permission denied
- `ERR_PROFILE_NOT_DEFINED` (exit 1) - Profile not found
- `ERR_PROFILE_RESOLVE_FAILED` (exit 1) - Profile resolution failed
- `ERR_PRESET_NOT_RESOLVED` (exit 1) - Preset resolution failed

### Error Hints

All errors include helpful hints for resolution:

```typescript
throw new KbError(
  'ERR_PROFILE_NOT_DEFINED',
  `Profile key "${key}" not found`,
  'Add it to kb-labs.config.yaml under "profiles"'
);
```

## Caching

### File System Cache

The system uses LRU caching for file system reads:
- **Key**: `absPath|mtime|size`
- **Export**: `clearCaches()` for tests and CLI

### Artifact Cache

Artifacts are cached with metadata:
- **Key**: SHA256 hash + MIME type
- **Export**: `clearCaches()` for tests and CLI

## Product Normalization

The system handles product ID normalization between file system and code:

```typescript
// File system (kebab-case)
toFsProduct('aiReview') // → 'ai-review'

// Code (camelCase)
toConfigProduct('ai-review') // → 'aiReview'
```

## Schema Versioning

All schemas include version information:

```json
{
  "schemaVersion": "1.0",
  "$id": "https://schemas.kb-labs.dev/profile/profile.schema.json"
}
```

## Integration Examples

### AI Review Integration

```typescript
import { loadBundle } from '@kb-labs/core-bundle';

async function runAiReview() {
  const bundle = await loadBundle({
    cwd: process.cwd(),
    product: 'aiReview'
  });

  // Check permissions
  if (!bundle.policy.permits('aiReview.run')) {
    throw new Error('Permission denied');
  }

  // Load rules from artifacts
  const rules = await bundle.artifacts.list('rules');
  
  // Use configuration
  const maxFiles = bundle.config.maxFiles || 100;
  
  // Run AI review with loaded configuration
  await runReview(bundle.config, rules);
}
```

### Release Management

```typescript
import { loadBundle } from '@kb-labs/core-bundle';

async function publishRelease() {
  const bundle = await loadBundle({
    cwd: process.cwd(),
    product: 'release'
  });

  // Check permissions
  if (!bundle.policy.permits('release.publish')) {
    throw new Error('Permission denied');
  }

  // Use configuration
  const config = bundle.config;
  
  // Publish with loaded configuration
  await publish(config);
}
```

## Troubleshooting

### Common Issues

1. **Configuration not found**
   - Create `kb-labs.config.yaml` in project root
   - Run `kb init` to generate template

2. **Profile not found**
   - Add profile to `kb-labs.config.yaml`
   - Install profile package: `pnpm add -D @kb-labs/profile-...`

3. **Permission denied**
   - Check policy configuration
   - Add role to policy overrides

4. **Artifact access denied**
   - Check file format (must be yml, yaml, md, txt, json)
   - Check file size (max 1MB)
   - Check path (no `..` escapes)

### Debug Commands

```bash
# Show configuration resolution
kb bundle explain --product=aiReview

# Clear caches
kb bundle print --product=aiReview --clear-cache

# Verbose output
kb bundle print --product=aiReview --verbose
```

## Migration Guide

### From v0.1 to v0.2

1. **Update configuration format**
   - Add `schemaVersion: "1.0"` to all config files
   - Convert to new profile format

2. **Update product integration**
   - Replace direct config access with `loadBundle()`
   - Use `bundle.config` instead of direct config
   - Use `bundle.artifacts` for file access
   - Use `bundle.policy.permits()` for permissions

3. **Update CLI usage**
   - Use new `kb bundle` commands
   - Update exit code handling

### Backward Compatibility

The system provides backward compatibility for:
- Old profile formats (with deprecation warnings)
- Legacy configuration files
- Existing CLI commands

## Performance Considerations

### Caching Strategy

- **File system reads**: LRU cache with mtime/size keys
- **Artifact metadata**: LRU cache with SHA256 keys
- **Configuration resolution**: Cached per product/profile combination

### Memory Usage

- **Cache limits**: Configurable LRU limits
- **Artifact limits**: 1MB per file, 100 files per key
- **Profile limits**: Max 8 levels of extends

### Network Usage

- **Offline-first**: Local `node_modules` checked before network
- **Caching**: Resolved packages cached locally
- **Fallback**: Network fallback for missing packages

## Security Considerations

### Artifact Security

- **Format whitelist**: Only safe file types allowed
- **Path sanitization**: No directory traversal
- **Size limits**: Prevent resource exhaustion
- **Hash verification**: All artifacts verified by SHA256

### Permission Model

- **Default deny**: No permissions by default
- **Role-based**: Permissions granted by roles
- **Resource-specific**: Permissions can be resource-specific
- **Audit trail**: All permission checks logged

## Future Enhancements

### Planned Features

1. **Studio Integration**
   - Web UI for configuration management
   - Visual configuration editor
   - Real-time configuration preview

2. **Advanced Caching**
   - Distributed caching
   - Cache invalidation strategies
   - Performance metrics

3. **Enhanced Security**
   - Digital signatures for profiles
   - Encrypted artifact storage
   - Advanced permission models

4. **Developer Experience**
   - Configuration validation
   - Auto-completion for schemas
   - Configuration templates

### Extension Points

The system is designed for extensibility:

- **Custom products**: Add new products by implementing the interface
- **Custom profiles**: Create profile packages for specific use cases
- **Custom policies**: Implement custom permission models
- **Custom artifacts**: Support for new artifact types

## Conclusion

The KB Labs v0.2 Core system provides a comprehensive, secure, and extensible configuration management solution. It addresses the needs of modern development workflows while maintaining backward compatibility and providing clear migration paths.

The system's layered architecture, security model, and developer experience features make it suitable for both individual developers and large organizations with complex configuration requirements.
