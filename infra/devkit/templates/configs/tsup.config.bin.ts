/**
 * Standard tsup configuration template for CLI binaries
 *
 * This template is for packages that provide executable binaries.
 * Examples: cli-bin, core-state-daemon, any standalone executables
 *
 * DO NOT modify this file locally - it is synced from @kb-labs/devkit
 *
 * Key differences from library template:
 * - Uses binPreset instead of nodePreset
 * - Bundles ALL dependencies into standalone executable
 * - Outputs .cjs format (CommonJS)
 * - No type generation (dts: false)
 * - Adds shebang automatically
 *
 * @see https://github.com/kb-labs/devkit#binary-packages
 */
import { defineConfig } from 'tsup';
import binPreset from '@kb-labs/devkit/tsup/bin.js';

export default defineConfig({
  ...binPreset,

  // REQUIRED: Use build-specific tsconfig (convention)
  tsconfig: 'tsconfig.build.json',

  // REQUIRED: Entry point for binary
  // Output will be dist/bin.cjs
  entry: { bin: 'src/bin.ts' },

  // binPreset already sets dts: false (binaries don't need types)
  // binPreset already adds shebang banner
  // binPreset already bundles everything
});
