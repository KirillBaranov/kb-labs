/**
 * Standard tsup configuration template for packages with BOTH library AND binary
 *
 * This template is for packages that provide:
 * 1. A library (importable by other packages)
 * 2. A CLI binary (executable)
 *
 * Examples: cli packages with both API and bin
 *
 * DO NOT modify this file locally - it is synced from @kb-labs/devkit
 *
 * Important: This builds BOTH lib and bin in one config.
 * For complex cases, use separate configs (tsup.lib.config.ts + tsup.bin.config.ts)
 *
 * @see https://github.com/kb-labs/devkit#dual-packages
 */
import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node.js';

export default defineConfig([
  // Library build (for imports)
  {
    ...nodePreset,
    tsconfig: 'tsconfig.build.json',
    entry: ['src/index.ts'], // Main library entry
    dts: true,
  },
  // Binary build (for execution)
  {
    format: ['cjs'],
    target: 'es2022',
    platform: 'node',
    sourcemap: true,
    clean: false, // Already cleaned by first build
    dts: false,
    treeshake: true,
    minify: false,
    outDir: 'dist',
    splitting: false,
    noExternal: [/.*/], // Bundle everything
    external: ['fsevents'], // Except native modules
    banner: { js: '#!/usr/bin/env node' },
    tsconfig: 'tsconfig.build.json',
    entry: { bin: 'src/bin.ts' }, // Binary entry
  },
]);
