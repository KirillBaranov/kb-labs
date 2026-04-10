# Plugin Versioning Guide

> **Note**
> ManifestV2 is the authoritative schema for plugin metadata. Examples that reference `manifestVersion: '1.0'` describe the internal compatibility layer; new plugins should maintain their CLI declarations inside `src/kb/manifest.ts` and let the registry derive those fields automatically.

This guide explains how to declare compatibility between your plugin and KB CLI versions.

## Overview

Plugins declare compatibility via the `engine` field in their manifest:

```typescript
{
  engine: {
    node: ">=18",
    kbCli: "^1.5.0",
    module: "esm"
  }
}
```

## KB CLI Version Compatibility

### Declaring Compatibility

Use semver ranges in `engine.kbCli`:

```typescript
{
  engine: {
    kbCli: "^1.5.0"  // Compatible with 1.5.0 and above, below 2.0.0
  }
}
```

### Common Patterns

**Major version compatibility**:
```typescript
kbCli: "^1.0.0"  // Works with 1.x.x
kbCli: "^1.5.0"  // Requires at least 1.5.0
```

**Exact version** (not recommended):
```typescript
kbCli: "1.5.0"  // Only works with exactly 1.5.0
```

**Range**:
```typescript
kbCli: ">=1.5.0 <2.0.0"  // Works with 1.5.0 to 1.x.x
```

## Version Detection

The CLI checks compatibility at plugin discovery time:

1. Plugin declares `engine.kbCli: "^1.5.0"`
2. CLI reads `process.env.CLI_VERSION` (e.g., "1.4.0")
3. CLI compares versions using semver
4. If incompatible: Warning shown, plugin may be disabled

## Compatibility Warnings

When incompatibility is detected:

```
⚠ Plugin @kb-labs/my-plugin requires kb-cli ^1.5.0, found 1.4.0
  → Upgrade CLI: pnpm -w update @kb-labs/cli
```

## Versioning Strategy

### For Plugin Authors

**Major.Minor.Patch**:
- **Major**: Breaking changes (rare)
- **Minor**: New features, backward compatible
- **Patch**: Bug fixes, backward compatible

**When to bump**:

1. **Major** (`2.0.0`):
   - Breaking API changes
   - Requires new CLI features
   - Removes deprecated APIs

2. **Minor** (`1.5.0`):
   - Uses new optional CLI features
   - Adds new manifest fields
   - Improves compatibility

3. **Patch** (`1.5.1`):
   - Bug fixes only
   - No API changes

### Declaring Requirements

**Conservative** (recommended for stable plugins):
```typescript
{
  engine: {
    kbCli: "^1.0.0"  // Works with any 1.x version
  }
}
```

**Latest features** (requires specific version):
```typescript
{
  engine: {
    kbCli: "^1.5.0"  // Requires 1.5.0+
  }
}
```

## Testing Compatibility

### Check Compatibility

```bash
# See all compatibility warnings
kb plugins doctor

# Check specific plugin
kb plugins doctor @kb-labs/my-plugin
```

### Test with Different Versions

```bash
# Set CLI version for testing
CLI_VERSION=1.4.0 kb plugins ls
CLI_VERSION=1.5.0 kb plugins ls
```

## Migration Path

### When CLI Updates

If CLI updates from `1.4.0` to `1.5.0`:

1. **Check your plugin**: Does it use new features?
2. **If yes**: Update `kbCli: "^1.5.0"`
3. **If no**: Keep `kbCli: "^1.0.0"` (still compatible)

### When Plugin Updates

If you want to use new CLI features:

1. **Check CLI version**: `kb version`
2. **Update manifest**: `kbCli: "^1.5.0"` (if CLI is 1.5.0+)
3. **Test**: `kb plugins doctor`
4. **Publish**: New plugin version

## Examples

### Example 1: Stable Plugin

```typescript
{
  manifestVersion: '1.0',
  id: 'my-plugin:command',
  engine: {
    kbCli: "^1.0.0"  // Works with any 1.x
  }
}
```

### Example 2: Uses New Features

```typescript
{
  manifestVersion: '1.0',
  id: 'my-plugin:command',
  engine: {
    kbCli: "^1.5.0",  // Requires permissions feature
    node: ">=18"
  },
  permissions: ["fs.write"]  // New in 1.5.0
}
```

### Example 3: Specific Requirements

```typescript
{
  manifestVersion: '1.0',
  id: 'my-plugin:command',
  engine: {
    kbCli: "^1.5.0",  // Requires new telemetry API
    node: ">=18.17.0",  // Specific Node version
    module: "esm"
  },
  telemetry: "opt-in"  // New in 1.5.0
}
```

## Best Practices

1. **Start conservative**: Use `^1.0.0` unless you need specific features
2. **Test thoroughly**: Verify compatibility with target CLI version
3. **Document requirements**: Mention CLI version in README
4. **Provide fallbacks**: Don't break on older CLI versions unless necessary
5. **Update gradually**: Bump `kbCli` requirement only when needed

## Troubleshooting

### Plugin not discovered

**Check**:
- CLI version matches `engine.kbCli` requirement
- Run `kb plugins doctor` for details

### Plugin disabled automatically

**Check**:
- Version incompatibility detected
- Check `.kb/plugins.json` for disabled plugins
- Run `kb plugins enable <name>` to re-enable

### Warning messages

**Action**:
- Update CLI: `pnpm -w update @kb-labs/cli`
- Or update plugin to support older CLI version

## Version History

- **1.0.0**: Initial plugin system
- **1.5.0**: Added permissions, telemetry, lifecycle hooks

## See Also

- [Manifest Specification](./manifest-spec.md)
- [Plugin Development Guide](./plugin-development.md)
- [Security Model](./security-model.md)

