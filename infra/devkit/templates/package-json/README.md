# Package.json Templates

Standard package.json templates for KB Labs monorepo packages.

## Philosophy

**Minimum Required Standard:**
- All packages MUST have the sections and scripts defined in these templates
- Packages CAN add MORE sections and scripts as needed
- Packages CANNOT have LESS than the standard (enforced by `kb-devkit-check-structure`)

## Templates

### Library Package (Standard)
**File:** `package.json.template`

**Use for:** Most packages (90%)
- Core libraries
- Contracts packages
- Utilities
- API clients

**Required sections:**
- `name`, `version`, `type`, `private`, `description`
- `main`, `types`, `exports`
- `files`, `sideEffects`
- `scripts` (8 required scripts)
- `dependencies`, `devDependencies`
- `engines`

**Required scripts:**
```json
{
  "clean": "rimraf dist",
  "build": "tsup --config tsup.config.ts",
  "dev": "tsup --config tsup.config.ts --watch",
  "lint": "eslint src --ext .ts",
  "lint:fix": "eslint src --ext .ts --fix",
  "type-check": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

### Binary Package
**File:** `package.json.bin.template`

**Use for:** CLI binaries
- `cli-bin`
- Daemon executables
- Standalone tools

**Differences from library:**
- Has `bin` field instead of `main`/`types`
- No `exports` (binaries don't export modules)

## Required DevDependencies

**All packages MUST have:**
```json
{
  "@kb-labs/devkit": "workspace:*",
  "@types/node": "^24.3.3",
  "rimraf": "^6.0.1",
  "tsup": "^8.5.0",
  "typescript": "^5.6.3",
  "vitest": "^3.2.4"
}
```

**Why these are required:**
- `@kb-labs/devkit` - Build system presets (tsup, eslint, tsconfig)
- `@types/node` - TypeScript types for Node.js
- `rimraf` - Cross-platform file deletion (clean script)
- `tsup` - Build tool (used in all packages)
- `typescript` - TypeScript compiler (type-check script)
- `vitest` - Test runner (test scripts)

## Optional Additions

**Packages CAN add:**
- Additional scripts (e.g., `test:benchmarks`, `test:all`)
- Additional dependencies
- Additional `exports` entries (subpath exports)
- Custom fields (e.g., `repository`, `keywords`)

**Examples:**
```json
{
  "scripts": {
    // ✅ Required scripts (must have all 8)
    "clean": "rimraf dist",
    "build": "tsup --config tsup.config.ts",
    "dev": "tsup --config tsup.config.ts --watch",
    "lint": "eslint src --ext .ts",
    "lint:fix": "eslint src --ext .ts --fix",
    "type-check": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",

    // ✅ Additional scripts (OK to add)
    "test:benchmarks": "vitest run tests/benchmarks",
    "test:all": "vitest run && vitest run tests/benchmarks",
    "pretype-check": "pnpm --filter @kb-labs/package build"
  },
  "exports": {
    // ✅ Required default export
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    // ✅ Additional exports (OK to add)
    "./analyzer": {
      "import": "./dist/analyzer/index.js",
      "types": "./dist/analyzer/index.d.ts"
    }
  }
}
```

## Validation

**Check package.json structure:**
```bash
npx kb-devkit-check-structure
```

**What it checks:**
- ✅ All required sections present
- ✅ All required scripts present
- ✅ All required devDependencies present
- ✅ Correct `type: "module"`
- ✅ Correct `engines` versions
- ⚠️ Warns about missing optional sections (repository, keywords)

**Auto-fix missing scripts:**
```bash
npx kb-devkit-check-structure --fix
```

## Common Issues

### Missing Scripts

**Problem:**
```bash
pnpm -r run test
# ❌ Error: "test" script not found in @kb-labs/some-package
```

**Solution:**
```bash
# Check which packages are missing scripts
npx kb-devkit-check-structure

# Auto-add missing scripts
npx kb-devkit-check-structure --fix
```

### Wrong Script Names

**Problem:**
```json
{
  "scripts": {
    "test:unit": "vitest run"  // ❌ Wrong, should be "test"
  }
}
```

**Solution:**
```json
{
  "scripts": {
    "test": "vitest run",           // ✅ Required
    "test:unit": "vitest run"       // ✅ Additional is OK
  }
}
```

### Missing DevDependencies

**Problem:**
```bash
pnpm run build
# ❌ Error: Cannot find module 'tsup'
```

**Solution:**
```bash
# Check missing devDependencies
npx kb-devkit-check-structure --verbose

# Install missing deps
pnpm install
```

## Migration Guide

**For existing packages:**

1. **Check current status:**
   ```bash
   npx kb-devkit-check-structure --package=@kb-labs/your-package
   ```

2. **Add missing scripts:**
   ```bash
   npx kb-devkit-check-structure --package=@kb-labs/your-package --fix
   ```

3. **Verify:**
   ```bash
   cd packages/your-package
   pnpm run build
   pnpm run test
   pnpm run lint
   ```

**For new packages:**

1. **Copy template:**
   ```bash
   cp kb-labs-devkit/templates/package-json/package.json.template package.json
   ```

2. **Update metadata:**
   - Change `name` to your package name
   - Update `description`
   - Add dependencies

3. **Verify:**
   ```bash
   npx kb-devkit-check-structure --package=@kb-labs/your-package
   ```

## Design Decisions

### Why "More is OK, Less is Not"?

**Consistency vs Flexibility:**
- **Minimum standard** ensures all packages work with monorepo scripts (`pnpm -r run build`)
- **Additional scripts** allow package-specific needs (benchmarks, integration tests)
- **Enforced baseline** prevents "missing script" errors in CI/CD

### Why These Exact Scripts?

**Based on actual usage:**
- `clean` - Required before rebuild (prevents stale artifacts)
- `build` - Used by CI, pre-commit hooks, dependencies
- `dev` - Developer workflow (watch mode)
- `lint` - Code quality checks
- `lint:fix` - Auto-fix linting issues
- `type-check` - TypeScript validation (separate from build)
- `test` - CI test runs
- `test:watch` - Developer workflow (TDD)

### Why Vitest (not Jest)?

**Modern, fast, ESM-native:**
- ✅ Native ESM support (no config needed)
- ✅ 10x faster than Jest for small tests
- ✅ Compatible with Vite ecosystem
- ✅ Built-in TypeScript support
- ✅ Watch mode with UI

**Migration from Jest:**
```bash
# Replace jest with vitest
pnpm remove jest @types/jest
pnpm add -D vitest

# Update scripts
# "test": "jest" → "test": "vitest run"
# "test:watch": "jest --watch" → "test:watch": "vitest"
```

## Future Improvements

**Planned features:**
- Auto-migration tool (`kb-devkit-migrate-package-json`)
- Version alignment checker (ensure all packages use same vitest/tsup versions)
- Script validation (ensure scripts actually work)
- Dependency audit (find unused deps)

## See Also

- [Config Templates](../configs/README.md) - tsup, eslint, tsconfig templates
- [DevKit README](../../README.md) - Complete DevKit documentation
- [Check Structure Tool](../../bin/devkit-check-structure.mjs) - Validation script
