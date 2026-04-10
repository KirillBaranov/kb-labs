import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node';

export default defineConfig({
  ...nodePreset,
  tsconfig: "tsconfig.build.json",
  entry: [
    'src/index.ts',
    'src/manifest.ts',
    'src/cli/commands/**/*.ts',  // Auto-include all CLI commands
    'src/rest/handlers/**/*.ts', // Auto-include all REST handlers
  ],
  external: [
    '@kb-labs/sdk',
    '@kb-labs/quality-contracts',
    '@kb-labs/quality-core',
  ],
  dts: true,
});
