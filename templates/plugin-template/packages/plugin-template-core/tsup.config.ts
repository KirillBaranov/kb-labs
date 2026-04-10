import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node';

export default defineConfig({
  ...nodePreset,
  tsconfig: "tsconfig.build.json", // Use build-specific tsconfig without paths
  entry: [
    'src/index.ts',
    'src/manifest.v2.ts',
    'src/manifest.v3.ts',
    // 'src/lifecycle/setup.ts', // TODO: Lifecycle SDK not available yet
    'src/cli/commands/**/*.ts',    // Auto-include all CLI commands
    'src/rest/handlers/**/*.ts',   // Auto-include all REST handlers
    'src/rest/schemas/**/*.ts',    // Auto-include all REST schemas
    // 'src/studio/widgets/**/*.tsx', // Studio widgets excluded
    // 'src/jobs/**/*.ts' // TODO: Jobs not supported in V3 SDK yet
  ],
  external: [
    '@kb-labs/plugin-manifest',
    '@kb-labs/shared-cli-ui',
    '@kb-labs/core-platform',
    'react',
    'react-dom'
  ],
  dts: true, // Temporarily disabled for V3 test
});
