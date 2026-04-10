import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node';

export default defineConfig({
  ...nodePreset,
  tsconfig: "tsconfig.build.json", // Use build-specific tsconfig without paths
  entry: [
    'src/index.ts',
    'src/manifest.v3.ts',
    'src/cli/commands/**/*.ts',
  ],
  external: [
    '@kb-labs/plugin-manifest',
    '@kb-labs/shared-cli-ui',
    '@kb-labs/core-platform',
  ],
  dts: true, // Temporarily disabled for V3 test
});
