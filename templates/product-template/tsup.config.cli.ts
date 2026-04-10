/**
 * Standard tsup configuration template for CLI packages
 *
 * This template is for CLI packages that provide:
 * - Multiple command handlers as separate entries
 * - Importable from other packages (not bundled)
 *
 * Examples: cli-commands, mind-cli, workflow-cli
 *
 * DO NOT modify this file locally - it is synced from @kb-labs/devkit
 *
 * Key differences:
 * - Multiple entry points for commands
 * - NOT bundled (uses nodePreset)
 * - Generates types (for other packages to import)
 *
 * @see https://github.com/kb-labs/devkit#cli-packages
 */
import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node.js';

export default defineConfig({
  ...nodePreset,

  // REQUIRED: Use build-specific tsconfig (convention)
  tsconfig: 'tsconfig.build.json',

  // REQUIRED: Multiple entries for CLI commands
  entry: [
    'src/index.ts', // Main export
    'src/commands/**/*.ts', // All command files
    // Add more entries as needed
  ],

  // REQUIRED: Explicit type generation
  dts: true,

  // OPTIONAL: CLI packages often have manifest files
  // If you have manifest.json or similar, you might need to copy it:
  // onSuccess: 'cp src/manifest.json dist/'
});
