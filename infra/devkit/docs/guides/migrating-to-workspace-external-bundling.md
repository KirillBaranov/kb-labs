# Migration Guide: Preventing Workspace Package Bundling

This guide helps you migrate existing packages to use the automatic workspace package externalization system, preventing accidental bundling of `@kb-labs/*` packages.

## Overview

The DevKit now automatically prevents workspace packages from being bundled by:
1. Generating `tsconfig.build.json` (without `paths`) for each package with `tsup.config.ts`
2. Generating `tsup.external.json` listing all workspace packages and dependencies
3. Using these configurations in tsup builds

## Prerequisites

- DevKit version with sync changes (includes `tsconfig.build.json` generation)
- All packages using `@kb-labs/devkit/tsup/node.js` preset

## Step-by-Step Migration

### Step 1: Update DevKit

Ensure you have the latest DevKit version:

```bash
pnpm add -D @kb-labs/devkit@latest
```

### Step 2: Run DevKit Sync

Generate `tsconfig.build.json` for all packages:

```bash
pnpm devkit:sync
```

This will:
- Find all `tsup.config.ts` files in your repository
- Generate `tsconfig.build.json` for each package
- Set `paths: {}` to prevent workspace package resolution

**Verify generation:**
```bash
find packages -name "tsconfig.build.json" -type f
```

### Step 3: Update tsup.config.ts

Update each package's `tsup.config.ts` to use `tsconfig.build.json`:

**Before:**
```typescript
import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node.js';

export default defineConfig({
  ...nodePreset,
  entry: { index: "src/index.ts" },
  // Missing tsconfig reference
});
```

**After:**
```typescript
import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node.js';

export default defineConfig({
  ...nodePreset,
  entry: { index: "src/index.ts" },
  tsconfig: "tsconfig.build.json", // Add this line
});
```

**Packages to update:**
- All packages with `tsup.config.ts` files
- Check: `find packages -name "tsup.config.ts" -type f`

### Step 4: Generate tsup.external.json

Install dependencies to trigger `postinstall` script:

```bash
pnpm install
```

This automatically generates `tsup.external.json` at the repository root.

**Manual generation (if needed):**
```bash
kb-devkit-tsup-external --generate
```

**Verify generation:**
```bash
cat tsup.external.json | head -20
```

Should list all `@kb-labs/*` packages and dependencies.

### Step 5: Rebuild Packages

Rebuild all packages to verify bundling:

```bash
pnpm build --filter "./packages/*"
```

**Check bundle sizes:**
```bash
# Before migration (if you have old builds)
ls -lh packages/*/dist/*.js

# After migration
ls -lh packages/*/dist/*.js
```

Bundle sizes should be significantly smaller (e.g., 300KB instead of 1MB+).

### Step 6: Verify External Imports

Check that workspace packages are imported as external:

```bash
# Check for external imports (should find many)
grep -r "import.*from '@kb-labs" packages/*/dist/*.js | head -10

# Check for bundled code (should find none or very few)
grep -r "@kb-labs" packages/*/dist/*.js | grep -v "import\|from" | head -5
```

### Step 7: Test Runtime

Test that packages work correctly:

```bash
# For CLI packages
pnpm kb --version

# For library packages
node -e "import('@kb-labs/your-package').then(m => console.log('OK'))"
```

### Step 8: Fix Missing Dependencies

If you encounter runtime errors like:
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'yaml'
```

Add the missing dependency to the package's `package.json`:

```bash
pnpm add yaml --filter @kb-labs/your-package
```

**Common missing dependencies:**
- `yaml` - Used for YAML parsing
- `glob` - Used for file globbing
- `minimatch` - Used for pattern matching
- Other transitive dependencies that were previously bundled

### Step 9: Verify Debug Logging

If your package uses debug logging, verify it works:

```bash
# For CLI packages
pnpm kb your-command --debug

# Should see debug logs
```

Debug logging should work correctly without module duplication issues.

## Troubleshooting

### Issue: `tsconfig.build.json` not generated

**Solution:**
1. Ensure `tsup.config.ts` exists in the package
2. Run `pnpm devkit:sync` again
3. Check that DevKit sync is not disabled in `kb-labs.config.json`

### Issue: Workspace packages still bundled

**Solution:**
1. Verify `tsconfig: "tsconfig.build.json"` is set in `tsup.config.ts`
2. Check that `tsconfig.build.json` has `paths: {}`
3. Verify `tsup.external.json` exists and lists workspace packages
4. Rebuild package: `pnpm build --filter <package-name>`

### Issue: Runtime errors for missing dependencies

**Solution:**
1. Check error message for missing package name
2. Add to `dependencies` in `package.json`:
   ```bash
   pnpm add <package-name> --filter <package-name>
   ```
3. Rebuild and test again

### Issue: Bundle size not reduced

**Solution:**
1. Check that `tsconfig.build.json` is being used:
   ```bash
   grep "tsconfig.build.json" packages/*/tsup.config.ts
   ```
2. Verify external imports exist:
   ```bash
   grep "import.*@kb-labs" packages/*/dist/*.js | head -5
   ```
3. Check for bundled workspace code:
   ```bash
   grep "@kb-labs" packages/*/dist/*.js | grep -v "import\|from" | head -5
   ```

### Issue: Type errors in d.ts generation

**Solution:**
1. Some packages may have type errors if they depend on packages without types
2. This is expected and doesn't affect runtime
3. Consider adding `dts: { resolve: false }` if needed:
   ```typescript
   export default defineConfig({
     ...nodePreset,
     tsconfig: "tsconfig.build.json",
     dts: { resolve: false },
   });
   ```

## Verification Checklist

- [ ] `tsconfig.build.json` exists for all packages with `tsup.config.ts`
- [ ] All `tsup.config.ts` files reference `tsconfig: "tsconfig.build.json"`
- [ ] `tsup.external.json` exists at repository root
- [ ] All packages build successfully
- [ ] Bundle sizes are reduced (check before/after)
- [ ] Workspace packages are imported as external (check `dist/*.js`)
- [ ] Runtime tests pass
- [ ] No missing dependency errors
- [ ] Debug logging works correctly (if applicable)

## Example: Complete Migration

Here's a complete example for a package:

```bash
# 1. Update DevKit
pnpm add -D @kb-labs/devkit@latest

# 2. Run sync
pnpm devkit:sync

# 3. Update tsup.config.ts
cat > packages/my-package/tsup.config.ts << 'EOF'
import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node.js';

export default defineConfig({
  ...nodePreset,
  entry: { index: "src/index.ts" },
  tsconfig: "tsconfig.build.json",
});
EOF

# 4. Install dependencies
pnpm install

# 5. Rebuild
pnpm build --filter @kb-labs/my-package

# 6. Verify
ls -lh packages/my-package/dist/*.js
grep "import.*@kb-labs" packages/my-package/dist/*.js | head -5

# 7. Test
node packages/my-package/dist/index.js
```

## Next Steps

After migration:

1. **Remove manual workarounds**: Remove any manual `external` arrays or workarounds
2. **Update CI**: Ensure CI runs `pnpm devkit:sync` before builds
3. **Document**: Update package README if needed
4. **Monitor**: Watch for any runtime issues and add missing dependencies

## Related Documentation

- [ADR-0011: Preventing Workspace Package Bundling](./adr/0011-preventing-workspace-package-bundling.md)
- [ADR-0005: Build & Types Strategy](./adr/0005-build-strategy.md)
- [DevKit README](../README.md)

## Support

If you encounter issues during migration:

1. Check this guide's troubleshooting section
2. Review ADR-0011 for technical details
3. Check DevKit sync logs: `pnpm devkit:sync --verbose`
4. Verify `tsup.external.json` generation: `kb-devkit-tsup-external --print`

