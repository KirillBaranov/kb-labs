import { defineConfig } from 'tsup';

/**
 * Preset for bin/executable builds.
 *
 * ## Overview
 *
 * This preset bundles ALL code (workspace packages + node_modules) into a single
 * standalone executable. Only Node.js built-ins remain external.
 *
 * ## Features
 *
 * - **Format**: CommonJS (better compatibility with bundled deps)
 * - **Bundling**: ALL dependencies included (workspace packages, node_modules)
 * - **Externals**: Only Node.js built-ins (fs, path, crypto, etc.)
 * - **Shebang**: Automatically adds `#!/usr/bin/env node`
 * - **Node.js built-ins plugin**: Handles both `node:*` and bare imports (e.g., `readline/promises`)
 * - **No types**: Binaries don't need .d.ts files
 *
 * ## When to use
 *
 * ✅ **Use for:**
 * - CLI binaries (cli-bin)
 * - Daemon binaries (core-state-daemon)
 * - Standalone executables
 * - Any script that needs to run without installing workspace packages
 *
 * ❌ **DO NOT use for:**
 * - Libraries (use tsup/node.js instead)
 * - Packages meant to be imported by other packages
 *
 * ## Important Notes
 *
 * 1. **Remove shebang from source**: Don't include `#!/usr/bin/env node` in src/bin.ts
 *    The preset adds it automatically via banner.
 *
 * 2. **Update package.json bin path**: Point to .cjs file:
 *    ```json
 *    "bin": { "my-cli": "./dist/bin.cjs" }
 *    ```
 *
 * 3. **Bundle size**: Expect 500KB-5MB depending on dependencies.
 *    This is normal for standalone executables.
 *
 * 4. **Dynamic imports**: Preserved! Plugins can still be loaded dynamically
 *    from filesystem. Only the core code is bundled.
 *
 * ## Basic Example
 *
 * ```typescript
 * import { defineConfig } from 'tsup';
 * import binPreset from '@kb-labs/devkit/tsup/bin.js';
 *
 * export default defineConfig({
 *   ...binPreset,
 *   tsconfig: "tsconfig.build.json",
 *   entry: { bin: 'src/bin.ts' },
 * });
 * ```
 *
 * ## Dual Build Example (Library + Bin)
 *
 * For packages that provide both a library and executable:
 *
 * ```typescript
 * // tsup.bin.config.ts
 * import { defineConfig } from 'tsup';
 * import binPreset from '@kb-labs/devkit/tsup/bin.js';
 *
 * export default defineConfig({
 *   ...binPreset,
 *   tsconfig: "tsconfig.build.json",
 *   entry: { bin: 'src/bin.ts' },
 * });
 * ```
 *
 * ```typescript
 * // tsup.lib.config.ts
 * import { defineConfig } from 'tsup';
 * import nodePreset from '@kb-labs/devkit/tsup/node.js';
 *
 * export default defineConfig({
 *   ...nodePreset,
 *   tsconfig: "tsconfig.build.json",
 *   entry: { index: 'src/index.ts' },
 *   clean: false, // Already cleaned by bin build
 * });
 * ```
 *
 * ```json
 * // package.json
 * {
 *   "scripts": {
 *     "build": "pnpm clean && tsup --config tsup.bin.config.ts && tsup --config tsup.lib.config.ts"
 *   }
 * }
 * ```
 *
 * ## Troubleshooting
 *
 * ### Error: "Cannot find module 'readline/promises'"
 * This is handled automatically by the esbuild plugin. If you still see this error,
 * it might be a Node.js built-in not in the NODE_BUILTINS list. Report it!
 *
 * ### Error: "Dynamic require is not supported"
 * This happens when bundling CJS packages with dynamic requires. The preset uses
 * CJS format specifically to avoid this. If you see this error, check if you're
 * using format: ['esm'] by mistake.
 *
 * ### Shebang appearing twice
 * Remove `#!/usr/bin/env node` from your src/bin.ts source file. The preset
 * adds it automatically.
 */
// List of Node.js built-in modules (without node: prefix)
const NODE_BUILTINS = [
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
  'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain',
  'events', 'fs', 'http', 'http2', 'https', 'inspector', 'module', 'net',
  'os', 'path', 'perf_hooks', 'process', 'punycode', 'querystring', 'readline',
  'repl', 'stream', 'string_decoder', 'sys', 'timers', 'tls', 'trace_events',
  'tty', 'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
];

export default defineConfig({
  format: ['cjs'], // Use CJS for better compatibility with bundled deps
  target: 'es2022',
  platform: 'node', // Treat as Node.js environment
  sourcemap: true,
  clean: true,
  dts: false, // Binaries don't need type definitions
  treeshake: true,
  minify: false,
  outDir: 'dist',
  splitting: false,

  // Bundle EVERYTHING (workspace packages, node_modules, etc)
  noExternal: [/.*/],

  // CRITICAL: Use 'require' condition for dual-format packages
  // When bundling CJS, we want to resolve to .cjs files, not .js (ESM)
  // This prevents "Could not resolve" errors for dual-format workspace packages
  esbuildOptions(options) {
    options.conditions = ['require', 'node'];
  },

  // esbuild plugin to mark Node.js built-ins as external
  esbuildPlugins: [
    {
      name: 'node-builtins-external',
      setup(build) {
        // Match Node.js built-ins with or without node: prefix, including subpaths
        const builtinRegex = new RegExp(`^(node:)?(${NODE_BUILTINS.join('|')})(\\/.*)?$`);

        build.onResolve({ filter: builtinRegex }, (args) => {
          return { path: args.path, external: true };
        });
      },
    },
  ],

  // ONLY externalize Node.js built-ins and native modules
  // Note: The esbuild plugin above handles most cases, but we keep this as a safety net
  external: [
    // Native modules that can't be bundled
    'fsevents',
  ],

  // Add shebang for executables
  banner: {
    js: '#!/usr/bin/env node',
  },
  ignoreWatch: [
    '**/node_modules/**',
    '**/dist/**',
    '**/.git/**',
  ],
});
