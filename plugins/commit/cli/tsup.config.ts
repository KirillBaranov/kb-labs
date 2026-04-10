import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node';

export default defineConfig({
  ...nodePreset,
  tsconfig: 'tsconfig.build.json',
  entry: [
    'src/index.ts',
    'src/manifest.ts',
    'src/lifecycle/setup.ts',
    'src/cli/commands/**/*.ts',    // Auto-include all CLI commands
    'src/rest/handlers/**/*.ts',   // Auto-include all REST API handlers
  ],
  external: [
    '@kb-labs/sdk',
    '@kb-labs/commit-core',
    '@kb-labs/commit-contracts',
  ],
  dts: {
    resolve: false,
    skipLibCheck: true,
  },
  clean: true,
  sourcemap: true,
});
