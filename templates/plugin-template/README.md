# Standard Configuration Templates

This directory contains canonical configuration templates for all `@kb-labs` packages.

## 📋 Available Templates

### Core Configs (All Packages)

| File | Purpose | Required | Customizable |
|------|---------|----------|--------------|
| **eslint.config.js** | Linting rules | ✅ Yes | ⚠️ Minimal |
| **tsconfig.json** | TypeScript IDE config | ✅ Yes | ❌ No |
| **tsconfig.build.json** | TypeScript build config | ✅ Yes | ❌ No |

### Tsup Configs (Choose ONE based on package type)

| Template | Package Type | Use Cases |
|----------|--------------|-----------|
| **tsup.config.ts** | 📦 **Library** (default) | Most packages, importable libraries |
| **tsup.config.bin.ts** | 🔧 **Binary** | Standalone executables, CLI bins |
| **tsup.config.cli.ts** | ⌨️ **CLI** | CLI packages with commands |
| **tsup.config.dual.ts** | 📦🔧 **Library + Binary** | Packages with both API and bin |

### Package.json Examples

| Template | Purpose |
|----------|---------|
| **package.json.lib** | Library package example |
| **package.json.bin** | Binary package example |

## 🎯 Philosophy

**Convention over Configuration**

All `@kb-labs` packages MUST use these exact templates with minimal customization. This ensures:

- ✅ Consistent build output across all packages
- ✅ Predictable dependency resolution
- ✅ Unified linting standards
- ✅ Easy maintenance and upgrades

## 📦 Usage

### For New Packages

#### Step 1: Choose Package Type

**Library Package** (most common):
```bash
cp kb-labs-devkit/templates/configs/tsup.config.ts your-package/
cp kb-labs-devkit/templates/configs/eslint.config.js your-package/
cp kb-labs-devkit/templates/configs/tsconfig*.json your-package/
cp kb-labs-devkit/templates/configs/package.json.lib your-package/package.json
```

**Binary Package** (standalone executables):
```bash
cp kb-labs-devkit/templates/configs/tsup.config.bin.ts your-package/tsup.config.ts
cp kb-labs-devkit/templates/configs/eslint.config.js your-package/
cp kb-labs-devkit/templates/configs/tsconfig*.json your-package/
cp kb-labs-devkit/templates/configs/package.json.bin your-package/package.json
```

**CLI Package** (command handlers):
```bash
cp kb-labs-devkit/templates/configs/tsup.config.cli.ts your-package/tsup.config.ts
cp kb-labs-devkit/templates/configs/eslint.config.js your-package/
cp kb-labs-devkit/templates/configs/tsconfig*.json your-package/
cp kb-labs-devkit/templates/configs/package.json.lib your-package/package.json
```

**Dual Package** (library + binary):
```bash
cp kb-labs-devkit/templates/configs/tsup.config.dual.ts your-package/tsup.config.ts
cp kb-labs-devkit/templates/configs/eslint.config.js your-package/
cp kb-labs-devkit/templates/configs/tsconfig*.json your-package/
cp kb-labs-devkit/templates/configs/package.json.lib your-package/package.json
# Then add "bin" field to package.json
```

#### Step 2: Customize Package Name
```bash
# Edit package.json and update name, description
```

### For Existing Packages

```bash
# Check for drift
npx kb-devkit-check-configs

# Auto-fix drift
npx kb-devkit-check-configs --fix
```

## 🔧 Customization Rules

### tsup.config.ts

**Allowed customizations:**

```typescript
export default defineConfig({
  ...nodePreset,
  tsconfig: 'tsconfig.build.json', // ✅ Always required

  // ✅ OK: Multiple entry points
  entry: ['src/index.ts', 'src/cli.ts'],

  // ✅ OK: Extra external deps (if really needed)
  external: ['special-native-module'],

  dts: true, // ✅ Always required
});
```

**NOT allowed:**

```typescript
// ❌ WRONG: Don't override preset settings
export default defineConfig({
  format: ['esm'],        // Already in preset!
  target: 'es2022',       // Already in preset!
  sourcemap: true,        // Already in preset!
  // ...
});

// ❌ WRONG: Don't disable types
dts: false,

// ❌ WRONG: Don't duplicate external deps
external: [
  '@kb-labs/core',  // Already in preset!
  '@kb-labs/cli',   // Already in preset!
],
```

### eslint.config.js

**Allowed customizations:**

```javascript
export default [
  ...nodePreset,
  {
    // ✅ OK: Project-specific ignores only
    ignores: ['**/*.generated.ts']
  }
];
```

**NOT allowed:**

```javascript
// ❌ WRONG: Don't duplicate preset ignores
export default [
  ...nodePreset,
  {
    ignores: [
      '**/dist/**',        // Already in preset!
      '**/node_modules/**', // Already in preset!
    ]
  }
];
```

### tsconfig.json & tsconfig.build.json

**NOT customizable!**

These files MUST remain identical to templates. All TypeScript configuration is standardized in DevKit presets.

```json
// ❌ WRONG: Don't override extends
{
  "extends": "./my-custom-base.json"
}

// ❌ WRONG: Don't add compilerOptions
{
  "extends": "@kb-labs/devkit/tsconfig/node.json",
  "compilerOptions": {
    "strict": false  // Don't override preset!
  }
}
```

## 🔍 Drift Detection

DevKit automatically detects configuration drift:

```bash
# Check all packages
npx kb-devkit-check-configs

# Check specific package
npx kb-devkit-check-configs --package=@kb-labs/core

# Auto-fix (creates backup)
npx kb-devkit-check-configs --fix

# CI mode (fail on drift)
npx kb-devkit-check-configs --ci
```

### Drift Detection Rules

| Issue | Severity | Auto-fix |
|-------|----------|----------|
| Missing `dts: true` | 🔴 Error | ✅ Yes |
| Using `dts: false` | 🔴 Error | ✅ Yes |
| Not using `nodePreset` | 🔴 Error | ⚠️ Manual |
| Duplicate `external` | 🟡 Warning | ✅ Yes |
| Duplicate `ignores` | 🟡 Warning | ✅ Yes |
| Missing templates | 🔴 Error | ✅ Yes |
| Modified templates | 🔴 Error | ⚠️ Manual |

## 📚 Examples

### ✅ Good Example (Minimal Package)

```typescript
// tsup.config.ts
import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node.js';

export default defineConfig({
  ...nodePreset,
  tsconfig: 'tsconfig.build.json',
  entry: ['src/index.ts'],
  dts: true,
});
```

### ✅ Good Example (CLI Package with Multiple Entries)

```typescript
// tsup.config.ts
import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node.js';

export default defineConfig({
  ...nodePreset,
  tsconfig: 'tsconfig.build.json',
  entry: [
    'src/index.ts',
    'src/cli/index.ts',
    'src/cli/commands/build.ts',
    'src/cli/commands/test.ts',
  ],
  dts: true,
});
```

### ❌ Bad Example (Over-configured)

```typescript
// tsup.config.ts
import { defineConfig } from 'tsup';

// ❌ Not using preset!
export default defineConfig({
  format: ['esm'],
  target: 'es2022',
  sourcemap: true,
  clean: true,
  dts: true,
  entry: ['src/index.ts'],
  external: [/^@kb-labs\/.*/],  // Manual external
});
```

## 🚀 Migration Guide

### From Custom Config to Standard Template

1. **Backup your current config**
   ```bash
   cp tsup.config.ts tsup.config.ts.backup
   ```

2. **Copy standard template**
   ```bash
   cp kb-labs-devkit/templates/configs/tsup.config.ts .
   ```

3. **Migrate customizations** (only if needed)
   - Compare your backup with template
   - Extract only truly necessary customizations
   - Add them with comments explaining why

4. **Test build**
   ```bash
   pnpm run build
   ```

5. **Verify types**
   ```bash
   npx kb-devkit-check-types
   ```

## 🔗 Related

- [DevKit README](../../README.md)
- [DevKit Usage Guide](../../USAGE_GUIDE.md)
- [ADR-0009: Unified Build Convention](../../docs/adr/0009-unified-build-convention.md)
