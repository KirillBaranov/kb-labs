# ADR-0009: Unified Build Convention for KB Labs Ecosystem

**Date:** 2025-10-21
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [tooling, architecture, process]

## Context

The KB Labs ecosystem has grown to include multiple monorepositories (cli, devlink, core, shared, ai-review, etc.) with heterogeneous build pipelines. This diversity creates several problems:

- **DevLink watch failures**: Build detection heuristics (like `tsc -b` for TypeScript project references) fail when packages don't have the expected structure
- **Inconsistent release automation**: Different build commands across packages make automated releases and CI unpredictable
- **Developer confusion**: Multiple build approaches require developers to learn different workflows per project
- **Maintenance overhead**: Each build variant needs separate testing, debugging, and documentation

For example, `kb-labs-ai-review` uses `build:js + build:types` while other projects use unified `tsup` builds. DevLink watch attempts to detect build commands automatically but fails when encountering `tsconfig.json` with `references` (intended for IDE/type-checking) and tries to use `tsc -b` instead of the actual build script.

## Decision

Establish a **unified build convention** across all KB Labs packages:

### 1. Standard Build Script
All packages MUST use:
```json
{
  "scripts": {
    "build": "tsup --config tsup.config.ts"
  }
}
```

### 2. Standard Tsup Configuration
All packages MUST use DevKit preset:
```typescript
// tsup.config.ts
import config from '@kb-labs/devkit/tsup/node.js'
export default config
```

This preset includes:
- `dts: true` (generates TypeScript declarations)
- `format: ['esm']` (ESM-only output)
- `target: 'es2022'`
- `sourcemap: true`
- `clean: true`
- `treeshake: true`

### 3. TypeScript Configuration Purpose
- `tsconfig.json` with `references` is for **IDE support and type-checking ONLY**
- Build orchestration tools (DevLink watch, CI) must NOT use `tsc -b` based on `references`
- Build orchestration must use `pnpm run build` (which calls `tsup`)

### 4. Explicit Overrides
Packages MAY override the build command via:
```json
{
  "devlink": {
    "watch": {
      "build": "custom-build-command"
    }
  }
}
```

Overrides MUST be documented with:
- Reason for deviation
- Owner/maintainer
- Review date

### 5. Package Structure
All packages MUST expose:
```json
{
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  }
}
```

## Rationale

- **Predictability**: All packages build the same way, eliminating guesswork in orchestration tools
- **Simplicity**: One build tool (`tsup`) handles both JavaScript and TypeScript declaration generation
- **Performance**: `tsup` is faster than separate `tsc` + bundler pipelines
- **Consistency**: Aligns with existing ADR-0005 (Build & Types Strategy) which already established `tsup` for type generation
- **Maintainability**: Reduces cognitive load and documentation surface area

## Consequences

### Positive
- ✅ **Reliable DevLink watch**: No more `tsc -b` failures from incorrect build detection
- ✅ **Simplified CI/CD**: Consistent build commands across all projects
- ✅ **Better developer experience**: Same build workflow everywhere
- ✅ **Reduced maintenance**: One build pipeline to test, debug, and document
- ✅ **Faster builds**: `tsup` is optimized for modern TypeScript projects

### Negative
- ❌ **Migration effort**: Legacy packages need to be updated (especially `kb-labs-ai-review`)
- ❌ **Reduced flexibility**: Custom build pipelines require explicit overrides
- ❌ **DevKit dependency**: All packages must use DevKit tsup preset

### Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| Breaking existing workflows | Gradual migration with backward compatibility during transition |
| DevKit changes breaking builds | DevKit versioning strategy + validation fixtures |
| Custom build requirements | Explicit override mechanism with documentation requirements |

## Enforcement

### Automated Validation
- `kb devkit check` validates all packages have standard build scripts
- CI workflows fail if non-standard build commands detected
- DevLink watch preflight shows build command source and status

### Sync Auto-Fix
- `kb devkit sync` can automatically add missing build scripts
- Updates `tsup.config.ts` to use DevKit preset
- Removes obsolete `tsconfig.types.json` files

### Exception Process
- Overrides require documented justification
- Annual review of all overrides
- Override requests go through ADR process for ecosystem-wide impact

## Migration Plan

### Phase 1: Establish Convention (Current)
1. Create this ADR
2. Update DevKit documentation
3. Fix DevLink watch build detection

### Phase 2: Migrate Legacy Packages
1. **kb-labs-ai-review**: Convert from `build:js + build:types` to unified `tsup`
2. **Other outliers**: Audit and migrate any remaining non-standard builds
3. Remove `tsconfig.types.json` files (no longer needed)

### Phase 3: Validation & Cleanup
1. Run validation across all projects
2. Update documentation and examples
3. Remove legacy build detection code

### Migration Steps for Legacy Packages
1. Update `package.json`:
   ```json
   {
     "scripts": {
       "build": "tsup --config tsup.config.ts"
     }
   }
   ```

2. Ensure `tsup.config.ts` uses DevKit preset:
   ```typescript
   import config from '@kb-labs/devkit/tsup/node.js'
   export default config
   ```

3. Remove `tsconfig.types.json` (if exists)

4. Test build and type-check:
   ```bash
   pnpm build
   pnpm type-check
   ```

5. Update any custom post-build steps to work with unified build

## References

- **Related ADRs**:
  - [ADR-0005: Build & Types Strategy](./0005-build-strategy.md) - Original tsup adoption
  - [ADR-0006: Monorepo Build & Types](./0006-monorepo-build-and-types.md) - Build orchestration
- **Implementation**: DevLink watch preflight validation
- **Tools**: `@kb-labs/devkit/tsup/node.js` preset
