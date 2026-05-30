import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node';

export default defineConfig({
  ...nodePreset,
  entry: ['src/index.ts'],
  tsconfig: "tsconfig.build.json", // Use build-specific tsconfig without paths
});

