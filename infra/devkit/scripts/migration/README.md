# KB Labs Workspace Bundling Migration Scripts

This directory contains scripts to help migrate all KB Labs projects to use the automatic workspace package externalization system.

## Scripts

### `check-status.sh`

Check migration status for all KB Labs projects.

```bash
./check-status.sh
```

Shows:
- Number of `tsup.config.ts` files
- Number of `tsconfig.build.json` files
- Whether `tsup.config.ts` files reference `tsconfig.build.json`
- Whether `tsup.external.json` exists
- Migration status (✅ MIGRATED, 🟡 PARTIAL, ❌ NOT MIGRATED)

### `migrate-project.sh <project-dir>`

Migrate a single project (semi-automated).

```bash
./migrate-project.sh kb-labs-core
```

This script:
1. Updates DevKit to latest version
2. Generates `tsconfig.build.json` via `pnpm devkit:sync`
3. Checks which `tsup.config.ts` files need updating
4. Generates `tsup.external.json` via `pnpm install`
5. Provides instructions for manual steps

### `migrate-all.sh`

Mass migration script for all remaining projects.

```bash
./migrate-all.sh
```

This script processes all projects and:
- Generates `tsup.external.json` for each
- Reports which files need manual updates

## Migration Status

### ✅ Completed Projects

- `kb-labs-cli` - Fully migrated
- `kb-labs-core` - All 12 packages updated
- `kb-labs-shared` - All 6 packages updated
- `kb-labs-devlink` - All 2 packages updated
- `kb-labs-release-manager` - All 4 packages updated
- `kb-labs-setup-engine` - All 2 packages updated

### 🟡 In Progress

All other projects have `tsconfig.build.json` generated but need `tsup.config.ts` updates.

## Manual Migration Steps

For each project that needs migration:

1. **Update tsup.config.ts files**:
   ```bash
   cd <project-dir>
   find packages -name "tsup.config.ts" -type f
   ```
   
   For each file, add `tsconfig: "tsconfig.build.json"`:
   ```typescript
   import { defineConfig } from 'tsup';
   import nodePreset from '@kb-labs/devkit/tsup/node.js';
   
   export default defineConfig({
     ...nodePreset,
     entry: { index: "src/index.ts" },
     tsconfig: "tsconfig.build.json", // Add this line
   });
   ```

2. **Generate tsup.external.json**:
   ```bash
   node ../kb-labs-devkit/bin/devkit-tsup-external.mjs --generate
   # or
   pnpm exec kb-devkit-tsup-external --generate
   ```

3. **Rebuild and test**:
   ```bash
   pnpm build
   ```

## Common Patterns

### Pattern 1: Simple defineConfig
```typescript
// Before
export default defineConfig({
  ...nodePreset,
  entry: { index: "src/index.ts" },
});

// After
export default defineConfig({
  ...nodePreset,
  entry: { index: "src/index.ts" },
  tsconfig: "tsconfig.build.json",
});
```

### Pattern 2: baseConfig import
```typescript
// Before
import baseConfig from '@kb-labs/devkit/tsup/node.js';
export default {
  ...baseConfig,
  entry: ['src/index.ts']
};

// After
import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node.js';
export default defineConfig({
  ...nodePreset,
  entry: ['src/index.ts'],
  tsconfig: "tsconfig.build.json",
});
```

### Pattern 3: Export default from devkit
```typescript
// Before
export { default } from "@kb-labs/devkit/tsup/node.js";

// After
import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node.js';
export default defineConfig({
  ...nodePreset,
  tsconfig: "tsconfig.build.json",
});
```

## Verification

After migration, verify:

1. **Build succeeds**:
   ```bash
   pnpm build
   ```

2. **Bundle sizes are reasonable**:
   ```bash
   ls -lh packages/*/dist/*.js
   ```

3. **Workspace packages are external**:
   ```bash
   grep "import.*@kb-labs" packages/*/dist/*.js | head -10
   ```

4. **Runtime works**:
   ```bash
   # For CLI projects
   pnpm <command> --version
   ```

## Troubleshooting

### Issue: Build fails with missing dependencies

Add missing dependencies to `package.json`:
```bash
pnpm add <missing-package> --filter <package-name>
```

### Issue: Type errors in d.ts generation

Some packages may have type errors if they depend on packages without types. This is expected and doesn't affect runtime. Consider adding:
```typescript
dts: { resolve: false }
```

### Issue: Workspace packages still bundled

1. Verify `tsconfig: "tsconfig.build.json"` is set
2. Check that `tsconfig.build.json` has `paths: {}`
3. Verify `tsup.external.json` exists and lists workspace packages
4. Rebuild: `pnpm build`


