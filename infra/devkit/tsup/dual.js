import { defineConfig } from 'tsup'
import { readTsupExternalSync } from './external-sync.mjs'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Dual Build Preset (ESM + CJS)
 *
 * ## Overview
 *
 * This preset builds BOTH ESM and CJS formats for maximum compatibility.
 * Use this for libraries that need to support both modern ESM imports
 * and legacy CJS requires (e.g., when bundling with tools like esbuild/rollup).
 *
 * ## Features
 *
 * - **Format**: ESM + CJS (dual exports)
 * - **Output**: dist/index.js (ESM) + dist/index.cjs (CJS)
 * - **Types**: dist/index.d.ts (shared for both formats)
 * - **Externals**: All workspace packages + node_modules
 * - **Tree-shaking**: Enabled
 *
 * ## When to use
 *
 * ✅ **Use for:**
 * - Core libraries used by CLI binaries (core-runtime, core-sys, etc.)
 * - Shared utilities that might be bundled by build tools
 * - Packages that need to work in both ESM and CJS environments
 * - Any library that might be consumed by bundlers (esbuild, rollup, webpack)
 *
 * ❌ **DO NOT use for:**
 * - CLI binaries (use tsup/bin.js instead)
 * - Pure ESM-only packages (use tsup/node.js instead)
 * - React libraries (use tsup/react-lib.js instead)
 *
 * ## Package.json Setup
 *
 * Update your package.json with dual exports:
 *
 * ```json
 * {
 *   "type": "module",
 *   "main": "./dist/index.cjs",
 *   "module": "./dist/index.js",
 *   "types": "./dist/index.d.ts",
 *   "exports": {
 *     ".": {
 *       "import": "./dist/index.js",
 *       "require": "./dist/index.cjs",
 *       "types": "./dist/index.d.ts"
 *     }
 *   }
 * }
 * ```
 *
 * ## Basic Example
 *
 * ```typescript
 * // tsup.config.ts
 * import { defineConfig } from 'tsup';
 * import dualPreset from '@kb-labs/devkit/tsup/dual.js';
 *
 * export default defineConfig({
 *   ...dualPreset,
 *   entry: { index: 'src/index.ts' },
 * });
 * ```
 *
 * ## Multi-Entry Example
 *
 * ```typescript
 * // tsup.config.ts
 * import { defineConfig } from 'tsup';
 * import dualPreset from '@kb-labs/devkit/tsup/dual.js';
 *
 * export default defineConfig({
 *   ...dualPreset,
 *   entry: {
 *     index: 'src/index.ts',
 *     utils: 'src/utils.ts',
 *     helpers: 'src/helpers.ts',
 *   },
 * });
 * ```
 *
 * ## Bundle Size Impact
 *
 * - Dual format roughly doubles the dist/ size (ESM + CJS)
 * - Types (.d.ts) are shared between both formats
 * - Example: ESM (50KB) + CJS (50KB) + Types (10KB) = 110KB total
 *
 * ## Why Dual Build?
 *
 * - **ESM**: Modern Node.js, better tree-shaking, top-level await
 * - **CJS**: Legacy bundlers, better compatibility, easier to bundle
 * - **Both**: Maximum compatibility across all environments
 *
 * ## Migration from ESM-only
 *
 * 1. Change import from `tsup/node.js` to `tsup/dual.js`
 * 2. Update package.json exports (see example above)
 * 3. Rebuild: `pnpm build`
 * 4. Verify: Check dist/ has both .js (ESM) and .cjs (CJS)
 */

function resolveExternalDependencies() {
  try {
    const pkgPath = join(process.cwd(), 'package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    const deps = Object.keys(pkg.dependencies ?? {})
    const peerDeps = Object.keys(pkg.peerDependencies ?? {})
    return Array.from(new Set([...deps, ...peerDeps]))
  } catch {
    return []
  }
}

function getExternal() {
  // Try to use generated tsup.external.json if available
  try {
    const generated = readTsupExternalSync()
    if (generated.length > 0) {
      return generated
    }
  } catch {
    // If reading fails, fallback to package.json
  }
  // Fallback to reading package.json directly
  return resolveExternalDependencies()
}

// Pre-compute external list once at module load time
const externalList = getExternal()

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'], // ⬅️ Build both ESM and CJS
  target: 'es2022',
  sourcemap: true,
  clean: true,
  dts: true, // Generate .d.ts (shared for both formats)
  treeshake: true,
  minify: false,
  outDir: 'dist',
  splitting: false, // Disable splitting for better CJS compatibility
  skipNodeModulesBundle: true,
  shims: false,
  // Mark all node_modules packages as external (including transitive deps)
  noExternal: [],
  external: [
    /^[^./]|^\.[^./]|^\.\.[^/]/, // All node_modules packages (not relative paths)
    ...externalList, // Explicitly listed packages (workspace + local deps)
    /^@kb-labs\//, // Force all @kb-labs packages to be external
  ],
  ignoreWatch: [
    '**/node_modules/**',
    '**/dist/**',
    '**/.git/**',
  ],
})
