/**
 * Standard tsup configuration template
 *
 * This is the canonical template for all @kb-labs packages.
 * DO NOT modify this file locally - it is synced from @kb-labs/devkit
 *
 * Customization guidelines:
 * - For single entry point: use as-is
 * - For multiple entry points: override `entry` array
 * - For extra external deps: extend `external` array (only if needed!)
 * - For special build needs: add minimal overrides, document why
 *
 * @see https://github.com/kb-labs/devkit#tsup-configuration
 */
import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node.js';

export default defineConfig({
  ...nodePreset,

  // REQUIRED: Use build-specific tsconfig (convention)
  tsconfig: 'tsconfig.build.json',

  // REQUIRED: Entry point(s)
  // Single entry (most common):
  entry: ['src/index.ts'],
  // Multiple entries (if needed):
  // entry: ['src/index.ts', 'src/cli/index.ts', 'src/api/index.ts'],

  // REQUIRED: Explicit type generation
  dts: true,

  // OPTIONAL: Only add if you need EXTRA externals beyond nodePreset
  // nodePreset already includes all @kb-labs/* packages + dependencies from package.json
  // external: ['special-package-not-in-preset'],
});
