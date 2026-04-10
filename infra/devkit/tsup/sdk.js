import { defineConfig } from 'tsup';

/**
 * Preset for SDK/facade builds.
 *
 * ## Overview
 *
 * This preset bundles ALL @kb-labs/* workspace packages into a single
 * self-contained SDK package. Consumers only need `@kb-labs/sdk` as dependency.
 *
 * ## Features
 *
 * - **Format**: ESM (modern, tree-shakeable)
 * - **Bundling**: ALL @kb-labs/* packages included
 * - **Externals**: Node.js built-ins + problematic CJS packages (execa, cross-spawn)
 * - **Types**: Full .d.ts generation
 * - **Multiple entry points**: Supports cli, helpers, manifest, etc.
 *
 * ## When to use
 *
 * ✅ **Use for:**
 * - SDK packages that re-export from multiple workspace packages
 * - Facade packages that need to be self-contained
 * - Packages where consumers shouldn't need to install transitive deps
 *
 * ❌ **DO NOT use for:**
 * - Regular libraries (use tsup/node.js instead)
 * - Binaries (use tsup/bin.js instead)
 * - Packages that should keep workspace deps as peer deps
 *
 * ## Example
 *
 * ```typescript
 * import { defineConfig } from 'tsup';
 * import sdkPreset from '@kb-labs/devkit/tsup/sdk.js';
 *
 * export default defineConfig({
 *   ...sdkPreset,
 *   tsconfig: 'tsconfig.build.json',
 *   entry: [
 *     'src/index.ts',
 *     'src/cli.ts',
 *     'src/helpers.ts',
 *   ],
 * });
 * ```
 *
 * ## Bundle Size
 *
 * Expect 500KB-2MB per entry point depending on how much is imported.
 * This is normal for self-contained SDK packages.
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

// CJS packages that use dynamic require and can't be bundled into ESM
// These must remain external and be installed as dependencies
const PROBLEMATIC_CJS_PACKAGES = [
  'execa',
  'cross-spawn',
  'glob',
  'minimatch',
  'fast-glob',
  'globby',
  'picomatch',
  'micromatch',
  'better-sqlite3',
  'sharp',
  'esbuild',
  'yaml', // Uses require('process') internally
];

export default defineConfig({
  format: ['esm'],
  target: 'es2022',
  platform: 'node',
  sourcemap: true,
  clean: true,
  dts: true,
  treeshake: true,
  minify: false,
  outDir: 'dist',
  splitting: false,

  // Bundle @kb-labs/* workspace packages, but NOT problematic CJS packages
  noExternal: [/^@kb-labs\//],

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

  // Externalize: Node.js built-ins, native modules, and problematic CJS packages
  external: [
    // Native modules that can't be bundled
    'fsevents',
    // CJS packages with dynamic require
    ...PROBLEMATIC_CJS_PACKAGES,
  ],
  ignoreWatch: [
    '**/node_modules/**',
    '**/dist/**',
    '**/.git/**',
  ],
});
